//! 26.46: the rhythm core (`nova_rhythm`) at the WebAssembly boundary. Flat f64 arrays in and out, so a
//! frame costs two calls and no JSON. 26.47: note types (type index per note, touches on custom notes,
//! script judgements) and the master timeline (track values, triggers).

use nova_rhythm::{Chart, ChartMode, InputEvent, InputKind, Judgement, Session, Settings};
use wasm_bindgen::prelude::*;

/// Input stride: kind (1 press, 2 release, 3 move), chart time, pointer id, x, y, lane, keyboard (0/1).
pub const INPUT_STRIDE: usize = 7;
/// Judgement stride: note, judgement (1 perfect … 5 miss), offset, time, x, y, combo, lane, kind, hold end,
/// line, type index.
pub const JUDGE_STRIDE: usize = 12;
/// Frame note stride: id, kind, x, y, rotation, distance, body, flags, lane, line, type index, size.
pub const FRAME_NOTE_STRIDE: usize = 12;
/// Note list stride: id, kind, time, end time, lane, line, x, side, type index, source index.
pub const NOTE_STRIDE: usize = 10;
/// Touch stride: note, offset, time, x, y, pointer id, keyboard.
pub const TOUCH_STRIDE: usize = 7;

fn settings_from(values: &[f64]) -> Settings {
    let d = Settings::default();
    let at = |i: usize, fallback: f64| {
        values
            .get(i)
            .copied()
            .filter(|v| v.is_finite())
            .unwrap_or(fallback)
    };
    Settings {
        windows: [
            at(0, d.windows[0]),
            at(1, d.windows[1]),
            at(2, d.windows[2]),
            at(3, d.windows[3]),
        ],
        scroll: at(4, d.scroll),
        lane_width: at(5, d.lane_width),
        judge_y: at(6, d.judge_y),
        hit_width: at(7, d.hit_width),
        flick_speed: at(8, d.flick_speed),
        hold_release: at(9, d.hold_release),
        visible_distance: at(10, d.visible_distance),
        visible_seconds: at(11, d.visible_seconds),
        autoplay: at(12, 0.0) > 0.5,
    }
    .normalized()
}

#[wasm_bindgen]
pub struct WasmRhythmSession {
    session: Session,
}

#[wasm_bindgen]
impl WasmRhythmSession {
    /// Parses and compiles a chart; `settings` as in `set_settings`. Throws with the reason on errors.
    #[wasm_bindgen(constructor)]
    pub fn new(chart_json: &str, settings: &[f64]) -> Result<WasmRhythmSession, JsValue> {
        let chart = Chart::parse(chart_json).map_err(|error| JsValue::from_str(&error.0))?;
        Ok(WasmRhythmSession {
            session: Session::new(chart, settings_from(settings)),
        })
    }

    /// [perfect, great, good, bad, scroll, laneWidth, judgeY, hitWidth, flickSpeed, holdRelease,
    /// visibleDistance, visibleSeconds, autoplay]; missing or invalid entries keep the defaults.
    pub fn set_settings(&mut self, settings: &[f64]) {
        self.session.settings = settings_from(settings);
    }

    /// 0 lanes, 1 lines.
    pub fn mode(&self) -> u32 {
        match self.session.chart.mode {
            ChartMode::Lanes => 0,
            ChartMode::Lines => 1,
        }
    }
    pub fn lanes(&self) -> u32 {
        self.session.chart.lanes
    }
    pub fn line_count(&self) -> u32 {
        self.session.chart.lines.len() as u32
    }
    pub fn note_count(&self) -> u32 {
        self.session.chart.notes.len() as u32
    }
    /// Seconds from beat 0 to the end of the last note.
    pub fn length(&self) -> f64 {
        self.session.chart.length
    }
    pub fn offset_ms(&self) -> f64 {
        self.session.chart.meta.offset_ms
    }
    pub fn audio(&self) -> String {
        self.session.chart.meta.audio.clone()
    }
    pub fn title(&self) -> String {
        self.session.chart.meta.title.clone()
    }
    pub fn artist(&self) -> String {
        self.session.chart.meta.artist.clone()
    }
    pub fn level(&self) -> String {
        self.session.chart.meta.level.clone()
    }

    pub fn reset(&mut self) {
        self.session.reset();
    }
    pub fn seek(&mut self, time: f64) {
        self.session.seek(time);
    }

    /// Processes input (stride 7) and judges up to `now`; returns judgements (stride 12).
    pub fn advance(&mut self, now: f64, input: &[f64]) -> Vec<f64> {
        let events: Vec<InputEvent> = input
            .chunks_exact(INPUT_STRIDE)
            .filter_map(|c| {
                let kind = match c[0] as i32 {
                    1 => InputKind::Press,
                    2 => InputKind::Release,
                    3 => InputKind::Move,
                    _ => return None,
                };
                Some(InputEvent {
                    kind,
                    time: c[1],
                    id: c[2] as i64,
                    x: c[3],
                    y: c[4],
                    lane: c[5] as i32,
                    keyboard: c[6] > 0.5,
                })
            })
            .collect();
        let results = self.session.advance(now, &events);
        let mut out = Vec::with_capacity(results.len() * JUDGE_STRIDE);
        for r in results {
            let line = self
                .session
                .chart
                .notes
                .get(r.note)
                .map(|n| n.line)
                .unwrap_or(0);
            out.extend_from_slice(&[
                r.note as f64,
                r.judgement as i32 as f64,
                r.offset,
                r.time,
                r.x,
                r.y,
                r.combo as f64,
                r.lane as f64,
                r.kind.code(),
                if r.hold_end { 1.0 } else { 0.0 },
                line as f64,
                r.type_index as f64,
            ]);
        }
        out
    }

    /// Presses on custom notes since the last call (stride 7: note, offset, time, x, y, pointer, keyboard).
    pub fn take_touches(&mut self) -> Vec<f64> {
        let touches = self.session.take_touches();
        let mut out = Vec::with_capacity(touches.len() * TOUCH_STRIDE);
        for t in touches {
            out.extend_from_slice(&[
                t.note as f64,
                t.offset,
                t.time,
                t.x,
                t.y,
                t.pointer as f64,
                if t.keyboard { 1.0 } else { 0.0 },
            ]);
        }
        out
    }

    /// Triggers passed since the last call (stride 3: index, beat, value); names from `trigger_names`.
    pub fn take_triggers(&mut self) -> Vec<f64> {
        let fired = self.session.take_triggers();
        let mut out = Vec::with_capacity(fired.len() * 3);
        for index in fired {
            let trigger = &self.session.chart.triggers[index];
            out.extend_from_slice(&[index as f64, trigger.beat, trigger.value]);
        }
        out
    }

    /// Trigger names in time order, one per line.
    pub fn trigger_names(&self) -> String {
        self.session
            .chart
            .triggers
            .iter()
            .map(|t| t.name.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Timeline tracks in file order, one "target\tproperty" per line.
    pub fn track_info(&self) -> String {
        self.session
            .chart
            .tracks
            .iter()
            .map(|t| {
                format!(
                    "{}\t{}",
                    t.target.replace(['\t', '\n'], " "),
                    t.property.replace(['\t', '\n'], " ")
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// One value per track at `time`; NaN before a track's first event.
    pub fn track_values(&self, time: f64) -> Vec<f64> {
        self.session.track_values(time)
    }

    /// Note type ids by index (tap, hold, drag, flick, then the chart's own), one per line.
    pub fn type_ids(&self) -> String {
        self.session
            .chart
            .types
            .iter()
            .map(|t| t.id.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// The game judges a note: `judgement` 1 perfect … 5 miss, or 0 to classify `offset` (seconds) by the
    /// note's windows. False when the note is not waiting for a judgement.
    pub fn judge_note(&mut self, note: u32, judgement: i32, offset: f64) -> bool {
        let value = match judgement {
            1 => Some(Judgement::Perfect),
            2 => Some(Judgement::Great),
            3 => Some(Judgement::Good),
            4 => Some(Judgement::Bad),
            5 => Some(Judgement::Miss),
            _ => None,
        };
        self.session.judge_note(note as usize, value, offset)
    }

    pub fn note_pending(&self, note: u32) -> bool {
        self.session.pending(note as usize)
    }

    /// [lineCount, (x, y, rotation, alpha, length) per line, noteCount,
    ///  (id, kind, x, y, rotation, distance, body, flags, lane, line, type, size) per note]; flags: 1
    ///  simultaneous, 2 holding.
    pub fn frame(&self, time: f64) -> Vec<f64> {
        let (lines, notes) = self.session.frame(time);
        let mut out = Vec::with_capacity(2 + lines.len() * 5 + notes.len() * FRAME_NOTE_STRIDE);
        out.push(lines.len() as f64);
        for l in &lines {
            out.extend_from_slice(&[l.x, l.y, l.rotation, l.alpha, l.length]);
        }
        out.push(notes.len() as f64);
        for n in &notes {
            let flags =
                (if n.simultaneous { 1.0 } else { 0.0 }) + (if n.holding { 2.0 } else { 0.0 });
            out.extend_from_slice(&[
                n.id as f64,
                n.kind.code(),
                n.x,
                n.y,
                n.rotation,
                n.distance,
                n.body,
                flags,
                n.lane as f64,
                n.line as f64,
                n.type_index as f64,
                n.size,
            ]);
        }
        out
    }

    /// [score, accuracy, combo, maxCombo, perfect, great, good, bad, miss, judged, total, early, late,
    ///  meanOffset, offsetDeviation, finished].
    pub fn stats(&self) -> Vec<f64> {
        let s = &self.session.stats;
        vec![
            self.session.score(),
            self.session.accuracy(),
            s.combo as f64,
            s.max_combo as f64,
            s.counts[0] as f64,
            s.counts[1] as f64,
            s.counts[2] as f64,
            s.counts[3] as f64,
            s.counts[4] as f64,
            s.judged as f64,
            self.session.total_notes() as f64,
            s.early as f64,
            s.late as f64,
            s.mean_offset(),
            s.offset_deviation(),
            if self.session.finished() { 1.0 } else { 0.0 },
        ]
    }

    /// Every note: (id, kind, time, endTime, lane, line, x, side, type, source) — for editors and progress
    /// bars; `source` is the note's index in the chart file.
    pub fn notes(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.session.chart.notes.len() * NOTE_STRIDE);
        for n in &self.session.chart.notes {
            out.extend_from_slice(&[
                n.id as f64,
                n.kind.code(),
                n.time,
                n.end_time,
                n.lane as f64,
                n.line as f64,
                n.x,
                n.side,
                n.type_index as f64,
                n.source as f64,
            ]);
        }
        out
    }

    pub fn time_to_beat(&self, time: f64) -> f64 {
        self.session.chart.tempo.time_to_beat(time)
    }
    pub fn beat_to_time(&self, beat: f64) -> f64 {
        self.session.chart.tempo.beat_to_time(beat)
    }
    pub fn bpm_at(&self, time: f64) -> f64 {
        self.session.chart.tempo.bpm_at_time(time)
    }
    /// Chart position of lane `lane`'s centre (lanes mode).
    pub fn lane_x(&self, lane: u32) -> f64 {
        self.session.lane_x(lane)
    }
}

/// "" when the chart is valid, otherwise the first problem found.
#[wasm_bindgen]
pub fn rhythm_validate_chart(chart_json: &str) -> String {
    match Chart::parse(chart_json) {
        Ok(_) => String::new(),
        Err(error) => error.0,
    }
}

/// Beat → seconds for a tempo list [beat, bpm, beat, bpm, …] (editors without a compiled chart).
#[wasm_bindgen]
pub fn rhythm_beat_to_time(tempo: &[f64], beat: f64) -> f64 {
    let points: Vec<(f64, f64)> = tempo.chunks_exact(2).map(|c| (c[0], c[1])).collect();
    nova_rhythm::TempoMap::new(&points).beat_to_time(beat)
}

/// Seconds → beat for a tempo list [beat, bpm, …].
#[wasm_bindgen]
pub fn rhythm_time_to_beat(tempo: &[f64], time: f64) -> f64 {
    let points: Vec<(f64, f64)> = tempo.chunks_exact(2).map(|c| (c[0], c[1])).collect();
    nova_rhythm::TempoMap::new(&points).time_to_beat(time)
}

/// Eased progress (the chart and tween curves) for editors.
#[wasm_bindgen]
pub fn rhythm_ease(name: &str, t: f64) -> f64 {
    nova_rhythm::Easing::parse(name).apply(t)
}
