//! A chart being played: input contacts, judgement of every note, combo and score, and the frame query
//! the renderer draws from.

use crate::chart::{Chart, ChartMode, Note, NoteKind, NoteType};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Judgement {
    Perfect = 1,
    Great = 2,
    Good = 3,
    Bad = 4,
    Miss = 5,
}

impl Judgement {
    pub fn weight(self) -> f64 {
        match self {
            Judgement::Perfect => 1.0,
            Judgement::Great => 0.8,
            Judgement::Good => 0.5,
            Judgement::Bad | Judgement::Miss => 0.0,
        }
    }
    pub fn keeps_combo(self) -> bool {
        matches!(
            self,
            Judgement::Perfect | Judgement::Great | Judgement::Good
        )
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Settings {
    /// Perfect, great, good and bad windows in seconds (each at least the previous one).
    pub windows: [f64; 4],
    /// Chart units scrolled per second at speed 1.
    pub scroll: f64,
    /// Lanes mode: lane width and the judgement line's y, in chart units.
    pub lane_width: f64,
    pub judge_y: f64,
    /// Lines mode: how far along a line from a note a touch still counts.
    pub hit_width: f64,
    /// Lines mode: pointer speed (chart units per second) that counts as a flick.
    pub flick_speed: f64,
    /// A hold counts as completed when released this many seconds before its end or later.
    pub hold_release: f64,
    /// Notes further than this (chart units) from their line are not drawn.
    pub visible_distance: f64,
    /// Notes further ahead than this (seconds) are not considered for drawing.
    pub visible_seconds: f64,
    pub autoplay: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            windows: [0.045, 0.09, 0.135, 0.18],
            scroll: 8.0,
            lane_width: 1.6,
            judge_y: -3.5,
            hit_width: 1.6,
            flick_speed: 18.0,
            hold_release: 0.12,
            visible_distance: 30.0,
            visible_seconds: 8.0,
            autoplay: false,
        }
    }
}

impl Settings {
    pub fn normalized(mut self) -> Settings {
        let mut previous = 0.001;
        for window in &mut self.windows {
            *window = if window.is_finite() {
                window.clamp(previous, 1.0)
            } else {
                previous
            };
            previous = *window;
        }
        let positive = |v: f64, d: f64| if v.is_finite() && v > 0.0 { v } else { d };
        let d = Settings::default();
        self.scroll = positive(self.scroll, d.scroll);
        self.lane_width = positive(self.lane_width, d.lane_width);
        self.judge_y = if self.judge_y.is_finite() {
            self.judge_y
        } else {
            d.judge_y
        };
        self.hit_width = positive(self.hit_width, d.hit_width);
        self.flick_speed = positive(self.flick_speed, d.flick_speed);
        self.hold_release = if self.hold_release.is_finite() {
            self.hold_release.clamp(0.0, 1.0)
        } else {
            d.hold_release
        };
        self.visible_distance = positive(self.visible_distance, d.visible_distance);
        self.visible_seconds = positive(self.visible_seconds, d.visible_seconds);
        self
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum InputKind {
    Press,
    Release,
    Move,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InputEvent {
    pub kind: InputKind,
    /// Chart time (seconds from beat 0) of the event, from its timestamp.
    pub time: f64,
    pub id: i64,
    /// Chart coordinates (pointer input).
    pub x: f64,
    pub y: f64,
    /// Lanes mode keyboard lane, or -1.
    pub lane: i32,
    pub keyboard: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct JudgeEvent {
    pub note: usize,
    pub judgement: Judgement,
    /// Input time minus note time (seconds; negative is early). 0 for misses and auto-judged notes.
    pub offset: f64,
    pub time: f64,
    pub x: f64,
    pub y: f64,
    pub combo: u32,
    pub lane: u32,
    pub kind: NoteKind,
    /// Index into the chart's note types.
    pub type_index: usize,
    /// The release that completed a hold (its judgement was already reported at the head).
    pub hold_end: bool,
}

/// A press on a `custom` note inside its window and hit area: the game's scripts decide the judgement.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TouchEvent {
    pub note: usize,
    /// Press time minus note time (seconds).
    pub offset: f64,
    pub time: f64,
    pub x: f64,
    pub y: f64,
    pub pointer: i64,
    pub keyboard: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum NoteState {
    Pending,
    Holding { judgement: Judgement, pointer: i64 },
    Done,
}

#[derive(Clone, Copy, Debug)]
struct Contact {
    id: i64,
    x: f64,
    y: f64,
    lane: i32,
    keyboard: bool,
    time: f64,
    vx: f64,
    vy: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Stats {
    pub counts: [u32; 5],
    pub combo: u32,
    pub max_combo: u32,
    pub judged: u32,
    /// Sum of judgement weight × note type weight.
    pub weight: f64,
    /// Sum of the type weights of the judged notes (accuracy = weight / weight_judged).
    pub weight_judged: f64,
    pub early: u32,
    pub late: u32,
    offset_sum: f64,
    offset_sq_sum: f64,
    offset_count: u32,
}

impl Stats {
    pub fn mean_offset(&self) -> f64 {
        if self.offset_count == 0 {
            0.0
        } else {
            self.offset_sum / self.offset_count as f64
        }
    }
    pub fn offset_deviation(&self) -> f64 {
        if self.offset_count < 2 {
            return 0.0;
        }
        let n = self.offset_count as f64;
        let mean = self.offset_sum / n;
        ((self.offset_sq_sum / n) - mean * mean).max(0.0).sqrt()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinePose {
    pub x: f64,
    pub y: f64,
    /// Degrees, counter-clockwise.
    pub rotation: f64,
    pub alpha: f64,
    pub length: f64,
    pub floor: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NoteDraw {
    pub id: usize,
    pub kind: NoteKind,
    /// Chart coordinates of the note's head.
    pub x: f64,
    pub y: f64,
    /// The line's rotation (degrees).
    pub rotation: f64,
    /// Signed distance of the head from the line along the line's normal.
    pub distance: f64,
    /// Signed length of a hold's body from the head (0 for other notes).
    pub body: f64,
    pub simultaneous: bool,
    pub holding: bool,
    pub lane: u32,
    pub line: usize,
    pub type_index: usize,
    pub size: f64,
}

pub struct Session {
    pub chart: Chart,
    pub settings: Settings,
    states: Vec<NoteState>,
    first_open: usize,
    contacts: Vec<Contact>,
    keyboard_flick: f64,
    pub stats: Stats,
    events: Vec<JudgeEvent>,
    touches: Vec<TouchEvent>,
    fired: Vec<usize>,
    next_trigger: usize,
    last_time: f64,
    /// The widest bad window of the chart's own note types (seconds).
    types_bad: f64,
    /// Sum of the scored notes' type weights, and the number of notes that count for the combo.
    score_total: f64,
    combo_total: u32,
}

impl Session {
    pub fn new(chart: Chart, settings: Settings) -> Session {
        let count = chart.notes.len();
        let types_bad = chart
            .types
            .iter()
            .filter_map(|t| t.windows.map(|w| w[3]))
            .fold(0.0, f64::max);
        let score_total = chart
            .notes
            .iter()
            .map(|n| chart.types[n.type_index].weight)
            .sum();
        let combo_total = chart
            .notes
            .iter()
            .filter(|n| chart.types[n.type_index].combo)
            .count() as u32;
        Session {
            chart,
            settings: settings.normalized(),
            states: vec![NoteState::Pending; count],
            first_open: 0,
            contacts: Vec::new(),
            keyboard_flick: f64::NEG_INFINITY,
            stats: Stats::default(),
            events: Vec::new(),
            touches: Vec::new(),
            fired: Vec::new(),
            next_trigger: 0,
            last_time: f64::NEG_INFINITY,
            types_bad,
            score_total,
            combo_total,
        }
    }

    /// The widest bad window in use (the component's or a note type's).
    fn max_bad(&self) -> f64 {
        self.settings.windows[3].max(self.types_bad)
    }

    fn note_type(&self, index: usize) -> &NoteType {
        &self.chart.types[self.chart.notes[index].type_index]
    }

    fn windows_of(&self, index: usize) -> [f64; 4] {
        self.note_type(index)
            .windows
            .unwrap_or(self.settings.windows)
    }

    /// What an untouched note becomes when its window has passed.
    fn timeout_judgement(&self, index: usize) -> Judgement {
        if self.note_type(index).timeout_perfect {
            Judgement::Perfect
        } else {
            Judgement::Miss
        }
    }

    /// Forgets every judgement (to play again, or after seeking back).
    pub fn reset(&mut self) {
        self.states.iter_mut().for_each(|s| *s = NoteState::Pending);
        self.first_open = 0;
        self.contacts.clear();
        self.keyboard_flick = f64::NEG_INFINITY;
        self.stats = Stats::default();
        self.events.clear();
        self.touches.clear();
        self.fired.clear();
        self.next_trigger = 0;
        self.last_time = f64::NEG_INFINITY;
    }

    /// Starts at `time` (seeking): notes before it count as not played and are skipped, not missed.
    pub fn seek(&mut self, time: f64) {
        self.reset();
        let bad = self.max_bad();
        for (index, note) in self.chart.notes.iter().enumerate() {
            if note.time < time - bad {
                self.states[index] = NoteState::Done;
            }
        }
        self.advance_first_open();
        self.next_trigger = self.chart.triggers.partition_point(|t| t.time < time);
        self.last_time = time;
    }

    pub fn total_notes(&self) -> usize {
        self.chart.notes.len()
    }

    pub fn finished(&self) -> bool {
        self.first_open >= self.states.len()
    }

    /// Out of 1,000,000: 900,000 for accuracy (weighted by note type) and 100,000 for the longest combo.
    /// A chart without scored notes or without combo notes gives the whole million to the other part.
    pub fn score(&self) -> f64 {
        let accuracy = (self.score_total > 0.0).then(|| self.stats.weight / self.score_total);
        let combo =
            (self.combo_total > 0).then(|| self.stats.max_combo as f64 / self.combo_total as f64);
        let value = match (accuracy, combo) {
            (Some(a), Some(c)) => 900_000.0 * a + 100_000.0 * c,
            (Some(a), None) => 1_000_000.0 * a,
            (None, Some(c)) => 1_000_000.0 * c,
            (None, None) => 0.0,
        };
        value.round()
    }

    pub fn accuracy(&self) -> f64 {
        if self.stats.weight_judged <= 0.0 {
            1.0
        } else {
            self.stats.weight / self.stats.weight_judged
        }
    }

    fn advance_first_open(&mut self) {
        while self.first_open < self.states.len() && self.states[self.first_open] == NoteState::Done
        {
            self.first_open += 1;
        }
    }

    pub fn line_pose(&self, line: usize, time: f64) -> LinePose {
        if self.chart.mode == ChartMode::Lanes {
            let floor = self
                .chart
                .lines
                .first()
                .map(|l| l.speed.floor(time))
                .unwrap_or(time);
            return LinePose {
                x: 0.0,
                y: self.settings.judge_y,
                rotation: 0.0,
                alpha: 1.0,
                length: self.chart.lanes as f64 * self.settings.lane_width,
                floor,
            };
        }
        let compiled = &self.chart.lines[line];
        LinePose {
            x: compiled.x.value(time),
            y: compiled.y.value(time),
            rotation: compiled.rotation.value(time),
            alpha: compiled.alpha.value(time).clamp(0.0, 1.0),
            length: compiled.length,
            floor: compiled.speed.floor(time),
        }
    }

    /// Lane centre (lanes mode), chart units.
    pub fn lane_x(&self, lane: u32) -> f64 {
        (lane as f64 + 0.5 - self.chart.lanes as f64 / 2.0) * self.settings.lane_width
    }

    fn note_local_x(&self, note: &Note) -> f64 {
        if self.chart.mode == ChartMode::Lanes {
            self.lane_x(note.lane)
        } else {
            note.x
        }
    }

    /// Chart position of a point on a line given its pose: `along` the line, `normal` away from it.
    fn line_point(pose: &LinePose, along: f64, normal: f64) -> (f64, f64) {
        let (sin, cos) = pose.rotation.to_radians().sin_cos();
        (
            pose.x + along * cos - normal * sin,
            pose.y + along * sin + normal * cos,
        )
    }

    /// Position of a point in a line's frame: (along, normal).
    fn to_line_frame(pose: &LinePose, x: f64, y: f64) -> (f64, f64) {
        let (sin, cos) = pose.rotation.to_radians().sin_cos();
        let dx = x - pose.x;
        let dy = y - pose.y;
        (dx * cos + dy * sin, -dx * sin + dy * cos)
    }

    fn hit_position(&self, note: &Note, time: f64) -> (f64, f64) {
        let pose = self.line_pose(note.line, time);
        Self::line_point(&pose, self.note_local_x(note), 0.0)
    }

    fn judge(
        &mut self,
        index: usize,
        judgement: Judgement,
        offset: f64,
        time: f64,
        hold_end: bool,
    ) {
        let note = self.chart.notes[index].clone();
        let (type_weight, counts_combo) = {
            let kind = &self.chart.types[note.type_index];
            (kind.weight, kind.combo)
        };
        if !hold_end {
            self.stats.counts[judgement as usize - 1] += 1;
            self.stats.judged += 1;
            self.stats.weight += judgement.weight() * type_weight;
            self.stats.weight_judged += type_weight;
            if counts_combo {
                if judgement.keeps_combo() {
                    self.stats.combo += 1;
                    self.stats.max_combo = self.stats.max_combo.max(self.stats.combo);
                } else {
                    self.stats.combo = 0;
                }
            }
            if judgement != Judgement::Miss && offset != 0.0 {
                self.stats.offset_sum += offset;
                self.stats.offset_sq_sum += offset * offset;
                self.stats.offset_count += 1;
                if judgement != Judgement::Perfect {
                    if offset < 0.0 {
                        self.stats.early += 1;
                    } else {
                        self.stats.late += 1;
                    }
                }
            }
        }
        let (x, y) = self.hit_position(&note, time);
        self.events.push(JudgeEvent {
            note: index,
            judgement,
            offset,
            time,
            x,
            y,
            combo: self.stats.combo,
            lane: note.lane,
            kind: note.kind,
            type_index: note.type_index,
            hold_end,
        });
    }

    /// A hold let go too early: its head judgement becomes a miss and the combo breaks.
    fn break_hold(&mut self, index: usize, head: Judgement, offset: f64, time: f64) {
        self.stats.counts[head as usize - 1] =
            self.stats.counts[head as usize - 1].saturating_sub(1);
        self.stats.counts[Judgement::Miss as usize - 1] += 1;
        let note = self.chart.notes[index].clone();
        let kind = &self.chart.types[note.type_index];
        self.stats.weight -= head.weight() * kind.weight;
        if kind.combo {
            self.stats.combo = 0;
        }
        let (x, y) = self.hit_position(&note, time);
        self.events.push(JudgeEvent {
            note: index,
            judgement: Judgement::Miss,
            offset,
            time,
            x,
            y,
            combo: self.stats.combo,
            lane: note.lane,
            kind: note.kind,
            type_index: note.type_index,
            hold_end: true,
        });
    }

    fn classify(windows: [f64; 4], offset: f64) -> Option<Judgement> {
        let a = offset.abs();
        let [perfect, great, good, bad] = windows;
        if a <= perfect {
            Some(Judgement::Perfect)
        } else if a <= great {
            Some(Judgement::Great)
        } else if a <= good {
            Some(Judgement::Good)
        } else if a <= bad {
            Some(Judgement::Bad)
        } else {
            None
        }
    }

    /// Judges what happened up to `time`: missed notes, drags and flicks, completed holds, autoplay.
    fn sweep(&mut self, time: f64) {
        let max_bad = self.max_bad();
        let mut index = self.first_open;
        while index < self.states.len() {
            let note_time = self.chart.notes[index].time;
            if note_time > time + max_bad {
                break;
            }
            let [_, _, good, bad] = self.windows_of(index);
            let kind = self.chart.notes[index].kind;
            match self.states[index] {
                NoteState::Done => {}
                NoteState::Holding { judgement, .. } => {
                    let end = self.chart.notes[index].end_time;
                    if time >= end - self.settings.hold_release
                        || (self.settings.autoplay && time >= end)
                    {
                        self.states[index] = NoteState::Done;
                        self.judge(index, judgement, 0.0, end.min(time), true);
                    }
                }
                NoteState::Pending => {
                    if self.settings.autoplay && note_time <= time {
                        self.auto_judge(index, note_time);
                    } else if matches!(kind, NoteKind::Drag | NoteKind::Flick) {
                        if (time - note_time).abs() <= good
                            && self.drag_or_flick_satisfied(index, time)
                        {
                            self.states[index] = NoteState::Done;
                            self.judge(index, Judgement::Perfect, 0.0, time.max(note_time), false);
                        } else if time > note_time + good {
                            self.states[index] = NoteState::Done;
                            let result = self.timeout_judgement(index);
                            self.judge(index, result, 0.0, note_time + good, false);
                        }
                    } else if time > note_time + bad {
                        self.states[index] = NoteState::Done;
                        let result = self.timeout_judgement(index);
                        self.judge(index, result, 0.0, note_time + bad, false);
                    }
                }
            }
            index += 1;
        }
        self.advance_first_open();
    }

    fn auto_judge(&mut self, index: usize, time: f64) {
        if self.chart.notes[index].kind == NoteKind::Hold {
            self.states[index] = NoteState::Holding {
                judgement: Judgement::Perfect,
                pointer: i64::MIN,
            };
        } else {
            self.states[index] = NoteState::Done;
        }
        self.judge(index, Judgement::Perfect, 0.0, time, false);
    }

    fn contact_near(&self, contact: &Contact, note: &Note, time: f64) -> bool {
        if contact.keyboard {
            return true;
        }
        if self.chart.mode == ChartMode::Lanes && contact.lane == note.lane as i32 {
            return true;
        }
        self.pointer_distance(note, contact.x, contact.y, time)
            .is_some()
    }

    /// Pointer at chart (x, y) against a note's hit area at `time`: its distance along the lane or line,
    /// or None outside. Lanes use the lane (or the type's width); lines the component's hit width (or the
    /// type's); a type with a height also limits the distance across the line.
    fn pointer_distance(&self, note: &Note, x: f64, y: f64, time: f64) -> Option<f64> {
        let kind = &self.chart.types[note.type_index];
        let pose = self.line_pose(note.line, time);
        let (along, across) = Self::to_line_frame(&pose, x, y);
        let centre = self.note_local_x(note);
        let distance = (along - centre).abs();
        let inside_width = if kind.width > 0.0 {
            distance <= kind.width * note.size / 2.0
        } else if self.chart.mode == ChartMode::Lanes {
            self.lane_of_point(x, y) == Some(note.lane)
        } else {
            distance <= self.settings.hit_width * note.size
        };
        let inside_height = kind.height <= 0.0 || across.abs() <= kind.height * note.size / 2.0;
        (inside_width && inside_height).then_some(distance)
    }

    fn drag_or_flick_satisfied(&self, index: usize, time: f64) -> bool {
        let note = &self.chart.notes[index];
        let good = self.windows_of(index)[2];
        match note.kind {
            NoteKind::Drag => self
                .contacts
                .iter()
                .any(|c| self.contact_near(c, note, time)),
            NoteKind::Flick => {
                (self.keyboard_flick - note.time).abs() <= good
                    || self.contacts.iter().any(|c| {
                        !c.keyboard
                            && (c.vx * c.vx + c.vy * c.vy).sqrt() >= self.settings.flick_speed
                            && self.contact_near(c, note, time)
                    })
            }
            _ => false,
        }
    }

    fn lane_of_point(&self, x: f64, _y: f64) -> Option<u32> {
        let left = -(self.chart.lanes as f64) * self.settings.lane_width / 2.0;
        let lane = ((x - left) / self.settings.lane_width).floor();
        if lane >= 0.0 && lane < self.chart.lanes as f64 {
            Some(lane as u32)
        } else {
            None
        }
    }

    fn press(&mut self, event: &InputEvent) {
        if event.keyboard {
            self.keyboard_flick = event.time;
        }
        let max_bad = self.max_bad();
        let lane = if self.chart.mode == ChartMode::Lanes {
            if event.lane >= 0 {
                Some(event.lane as u32)
            } else {
                self.lane_of_point(event.x, event.y)
            }
        } else {
            None
        };
        let mut best: Option<(usize, f64)> = None;
        let mut index = self.first_open;
        while index < self.states.len() {
            let note = &self.chart.notes[index];
            if note.time > event.time + max_bad {
                break;
            }
            let bad = self.windows_of(index)[3];
            if self.states[index] == NoteState::Pending
                && matches!(note.kind, NoteKind::Tap | NoteKind::Hold | NoteKind::Custom)
                && (event.time - note.time).abs() <= bad
            {
                // A key press fits its lane (lanes) or any note (lines); a pointer the note's hit area.
                let fitted = if event.keyboard {
                    match self.chart.mode {
                        ChartMode::Lanes => (lane == Some(note.lane)).then_some(0.0),
                        ChartMode::Lines => Some(0.0),
                    }
                } else if self.chart.mode == ChartMode::Lanes
                    && self.chart.types[note.type_index].width <= 0.0
                    && self.chart.types[note.type_index].height <= 0.0
                {
                    (lane == Some(note.lane)).then_some(0.0)
                } else {
                    self.pointer_distance(note, event.x, event.y, event.time)
                };
                if let (Some(_), NoteKind::Custom) = (fitted, note.kind) {
                    // Custom notes are judged by the game; the press is reported and not consumed.
                    self.touches.push(TouchEvent {
                        note: index,
                        offset: event.time - note.time,
                        time: event.time,
                        x: event.x,
                        y: event.y,
                        pointer: event.id,
                        keyboard: event.keyboard,
                    });
                } else if let Some(distance) = fitted {
                    // The earliest note wins; among notes at the same time the nearest.
                    match best {
                        None => best = Some((index, distance)),
                        Some((best_index, best_distance)) => {
                            let best_time = self.chart.notes[best_index].time;
                            if (note.time - best_time).abs() < 1e-6 && distance < best_distance {
                                best = Some((index, distance));
                            }
                        }
                    }
                }
            }
            index += 1;
        }
        if let Some((index, _)) = best {
            let offset = event.time - self.chart.notes[index].time;
            let judgement =
                Self::classify(self.windows_of(index), offset).unwrap_or(Judgement::Bad);
            if self.chart.notes[index].kind == NoteKind::Hold && judgement.keeps_combo() {
                self.states[index] = NoteState::Holding {
                    judgement,
                    pointer: event.id,
                };
            } else {
                self.states[index] = NoteState::Done;
            }
            self.judge(index, judgement, offset, event.time, false);
        }
        self.contacts.retain(|c| c.id != event.id);
        self.contacts.push(Contact {
            id: event.id,
            x: event.x,
            y: event.y,
            lane: event.lane,
            keyboard: event.keyboard,
            time: event.time,
            vx: 0.0,
            vy: 0.0,
        });
    }

    fn release(&mut self, event: &InputEvent) {
        self.contacts.retain(|c| c.id != event.id);
        // A hold whose pointer let go before the end is broken.
        for index in self.first_open..self.states.len() {
            if let NoteState::Holding { pointer, judgement } = self.states[index] {
                if pointer == event.id {
                    let end = self.chart.notes[index].end_time;
                    self.states[index] = NoteState::Done;
                    if event.time < end - self.settings.hold_release {
                        self.break_hold(index, judgement, event.time - end, event.time);
                    } else {
                        self.judge(index, judgement, 0.0, event.time, true);
                    }
                }
            }
        }
        self.advance_first_open();
    }

    fn movement(&mut self, event: &InputEvent) {
        if let Some(contact) = self.contacts.iter_mut().find(|c| c.id == event.id) {
            let dt = event.time - contact.time;
            if dt > 1e-4 {
                let vx = (event.x - contact.x) / dt;
                let vy = (event.y - contact.y) / dt;
                // Smooth over a few samples so one jittery event does not count as a flick.
                contact.vx = contact.vx * 0.4 + vx * 0.6;
                contact.vy = contact.vy * 0.4 + vy * 0.6;
                contact.time = event.time;
            }
            contact.x = event.x;
            contact.y = event.y;
        }
    }

    /// Processes input (sorted by time) and judges everything up to `now`. Returns the new judgements.
    pub fn advance(&mut self, now: f64, input: &[InputEvent]) -> Vec<JudgeEvent> {
        let mut sorted: Vec<InputEvent> = input
            .iter()
            .copied()
            .filter(|e| e.time.is_finite())
            .collect();
        sorted.sort_by(|a, b| a.time.total_cmp(&b.time));
        for event in &sorted {
            // Late events (older than the last sweep) are judged at their own time all the same.
            self.sweep(event.time);
            match event.kind {
                InputKind::Press => {
                    if !self.settings.autoplay {
                        self.press(event)
                    }
                }
                InputKind::Release => self.release(event),
                InputKind::Move => self.movement(event),
            }
            self.sweep(event.time);
        }
        if now.is_finite() {
            self.sweep(now);
            self.last_time = self.last_time.max(now);
            while self.next_trigger < self.chart.triggers.len()
                && self.chart.triggers[self.next_trigger].time <= now
            {
                self.fired.push(self.next_trigger);
                self.next_trigger += 1;
            }
        }
        std::mem::take(&mut self.events)
    }

    /// Presses on custom notes since the last call.
    pub fn take_touches(&mut self) -> Vec<TouchEvent> {
        std::mem::take(&mut self.touches)
    }

    /// Triggers (indices into `chart.triggers`) passed since the last call, in time order. Each fires once
    /// per play; a seek starts again from the first trigger at or after the new time.
    pub fn take_triggers(&mut self) -> Vec<usize> {
        std::mem::take(&mut self.fired)
    }

    /// The game judges a note itself (custom notes, or any pending note): with a judgement, or with an
    /// offset in seconds classified by the note's windows (outside them: a miss). False when the note is
    /// not waiting for a judgement.
    pub fn judge_note(&mut self, index: usize, judgement: Option<Judgement>, offset: f64) -> bool {
        if index >= self.states.len() || self.states[index] != NoteState::Pending {
            return false;
        }
        let offset = if offset.is_finite() { offset } else { 0.0 };
        let result = judgement.unwrap_or_else(|| {
            Self::classify(self.windows_of(index), offset).unwrap_or(Judgement::Miss)
        });
        let note_time = self.chart.notes[index].time;
        let time = if self.last_time.is_finite() {
            self.last_time
        } else {
            note_time + offset
        };
        self.states[index] = NoteState::Done;
        self.judge(index, result, offset, time, false);
        self.advance_first_open();
        true
    }

    /// The master timeline at `time`: one value per track, NaN before a track's first event (the target
    /// keeps its own value until then).
    pub fn track_values(&self, time: f64) -> Vec<f64> {
        self.chart
            .tracks
            .iter()
            .map(|track| {
                if track.curve.started(time) {
                    track.curve.value(time)
                } else {
                    f64::NAN
                }
            })
            .collect()
    }

    pub fn pending(&self, index: usize) -> bool {
        matches!(self.states.get(index), Some(NoteState::Pending))
    }

    pub fn holding(&self, index: usize) -> bool {
        matches!(self.states.get(index), Some(NoteState::Holding { .. }))
    }

    pub fn done(&self, index: usize) -> bool {
        matches!(self.states.get(index), Some(NoteState::Done))
    }

    /// Lines and the notes to draw at `time`.
    pub fn frame(&self, time: f64) -> (Vec<LinePose>, Vec<NoteDraw>) {
        let lines: Vec<LinePose> = (0..self.chart.lines.len().max(1))
            .map(|line| self.line_pose(line.min(self.chart.lines.len().saturating_sub(1)), time))
            .collect();
        let mut notes = Vec::new();
        let horizon = time + self.settings.visible_seconds;
        let max_distance = self.settings.visible_distance;
        for index in self.first_open..self.states.len() {
            let note = &self.chart.notes[index];
            let holding = self.holding(index);
            if note.time > horizon && !holding {
                // Notes are time-sorted; with very slow lines a later note could still be far away, so the
                // horizon is the cut-off.
                break;
            }
            if self.done(index) {
                continue;
            }
            let pose = &lines[note.line.min(lines.len() - 1)];
            let scale = self.settings.scroll * note.speed * note.side;
            let mut distance = (note.floor - pose.floor) * scale;
            let end_distance = (note.end_floor - pose.floor) * scale;
            if holding {
                distance = 0.0;
            }
            // A note that already passed its line is no longer drawn (unless it is a hold still on screen).
            let passed = distance * note.side < -0.05 && note.kind != NoteKind::Hold;
            if passed || distance.abs() > max_distance {
                continue;
            }
            let along = self.note_local_x(note);
            let (x, y) = Self::line_point(pose, along, distance);
            let body = if note.kind == NoteKind::Hold {
                end_distance - distance
            } else {
                0.0
            };
            if note.kind == NoteKind::Hold
                && end_distance * note.side < 0.0
                && !holding
                && (note.time < time)
            {
                continue;
            }
            notes.push(NoteDraw {
                id: note.id,
                kind: note.kind,
                x,
                y,
                rotation: pose.rotation,
                distance,
                body,
                simultaneous: note.simultaneous,
                holding,
                lane: note.lane,
                line: note.line,
                type_index: note.type_index,
                size: note.size,
            });
        }
        (lines, notes)
    }
}
