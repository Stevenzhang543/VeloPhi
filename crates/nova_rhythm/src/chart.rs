//! The Nova chart format (`nova-chart` JSON, versions 1 and 2) and its compiled, time-sorted form.
//!
//! Times in the file are beats; the tempo map turns them into seconds. A chart is played in one of two
//! modes that share everything else:
//! - `lanes`: N fixed lanes (4–8) scrolling onto one horizontal judgement line (osu!mania style);
//! - `lines`: any number of judgement lines that move, turn, fade and change speed through eased
//!   events, with notes on either side of them (Phigros style).
//!
//! Version 2 (26.47) adds what a version 1 chart cannot say, and reads every version 1 chart unchanged:
//! - `noteTypes`: the chart's own note types. Each has a base behaviour (tap, hold, drag, flick, or
//!   `custom`: judged by the game's scripts), its own judgement windows, a score weight, whether it counts
//!   for the combo, what an untouched note becomes (`timeout`: miss, or perfect for notes to avoid) and a
//!   hit area. A note names its type in `type`; the four built-in names stay valid.
//! - per note `size` (hit area and drawing scale); the runtime also passes a note's `data` to scripts.
//! - `tracks`: the master timeline. Eased events over beats animate a scene object, the camera or a
//!   post-processing value (`target`, `property`); the runtime applies the values.
//! - `triggers`: named moments (beat, name, value) the runtime turns into signals.

use serde::{Deserialize, Serialize};

use crate::curve::{Curve, CurveEvent, SpeedCurve};
use crate::ease::Easing;
use crate::tempo::TempoMap;

pub const FORMAT: &str = "nova-chart";
pub const VERSION: u32 = 2;
pub const MAX_NOTE_TYPES: usize = 256;
pub const MAX_TRACKS: usize = 512;
pub const MAX_TRIGGERS: usize = 20_000;
pub const MAX_NOTES: usize = 100_000;
pub const MAX_LINES: usize = 256;
pub const MAX_EVENTS_PER_CURVE: usize = 20_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChartMode {
    #[default]
    Lanes,
    Lines,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NoteKind {
    #[default]
    Tap,
    Hold,
    Drag,
    Flick,
    /// Judged by the game: presses on it are reported (touches), scripts give the judgement.
    Custom,
}

impl NoteKind {
    pub fn code(self) -> f64 {
        match self {
            NoteKind::Tap => 0.0,
            NoteKind::Hold => 1.0,
            NoteKind::Drag => 2.0,
            NoteKind::Flick => 3.0,
            NoteKind::Custom => 4.0,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            NoteKind::Tap => "tap",
            NoteKind::Hold => "hold",
            NoteKind::Drag => "drag",
            NoteKind::Flick => "flick",
            NoteKind::Custom => "custom",
        }
    }
    fn builtin(name: &str) -> Option<NoteKind> {
        match name {
            "" | "tap" => Some(NoteKind::Tap),
            "hold" => Some(NoteKind::Hold),
            "drag" => Some(NoteKind::Drag),
            "flick" => Some(NoteKind::Flick),
            _ => None,
        }
    }
}

fn one() -> f64 {
    1.0
}
fn default_lanes() -> u32 {
    4
}
fn default_length() -> f64 {
    24.0
}
fn yes() -> bool {
    true
}
fn tap_name() -> String {
    "tap".into()
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChartMeta {
    pub title: String,
    pub artist: String,
    pub charter: String,
    pub level: String,
    /// Audio asset reference ("asset://uuid" or a path).
    pub audio: String,
    /// Where beat 0 is in the audio, in milliseconds (positive: the music starts before beat 0).
    pub offset_ms: f64,
    pub preview_start: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TempoPoint {
    pub beat: f64,
    pub bpm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EventDef {
    pub start: f64,
    pub end: f64,
    pub from: f64,
    pub to: f64,
    #[serde(default)]
    pub ease: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LineEvents {
    pub x: Vec<EventDef>,
    pub y: Vec<EventDef>,
    pub rotation: Vec<EventDef>,
    pub alpha: Vec<EventDef>,
    pub speed: Vec<EventDef>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LineDef {
    pub x: f64,
    pub y: f64,
    /// Degrees, counter-clockwise.
    pub rotation: f64,
    pub alpha: f64,
    pub speed: f64,
    pub length: f64,
    pub events: LineEvents,
}

impl Default for LineDef {
    fn default() -> Self {
        LineDef {
            x: 0.0,
            y: 0.0,
            rotation: 0.0,
            alpha: 1.0,
            speed: 1.0,
            length: default_length(),
            events: LineEvents::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDef {
    /// A built-in type (tap, hold, drag, flick) or the id of one of the chart's `noteTypes`.
    #[serde(rename = "type", default = "tap_name")]
    pub kind: String,
    pub beat: f64,
    #[serde(default)]
    pub end_beat: Option<f64>,
    #[serde(default)]
    pub lane: u32,
    #[serde(default)]
    pub line: u32,
    /// Position along the line (lines mode), in chart units.
    #[serde(default)]
    pub x: f64,
    /// 1: the note comes from above the line, -1: from below.
    #[serde(default = "one")]
    pub side: f64,
    /// Multiplier on the line's scroll speed.
    #[serde(default = "one")]
    pub speed: f64,
    /// Scales the note's hit area (and its drawing).
    #[serde(default = "one")]
    pub size: f64,
}

/// A chart's own note type (version 2). Look, prefab and sounds are read by the runtime, not here.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTypeDef {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub base: NoteKind,
    /// Perfect, great, good and bad windows in milliseconds; absent: the chart component's windows.
    #[serde(default)]
    pub windows: Option<Vec<f64>>,
    /// Score weight (0: the note is not scored).
    #[serde(default = "one")]
    pub weight: f64,
    /// Counts for the combo (and a miss breaks it).
    #[serde(default = "yes")]
    pub combo: bool,
    /// What a note nobody touched becomes: "miss" (default) or "perfect" (a note to avoid).
    #[serde(default)]
    pub timeout: String,
    /// Hit area in chart units (0: the component's): width along the lane or line, height across it.
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
}

/// A master-timeline track: eased events (beats) on one property of one target.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDef {
    /// A scene object's name, `camera` or `post`.
    pub target: String,
    pub property: String,
    #[serde(default)]
    pub events: Vec<EventDef>,
}

/// A named moment on the timeline.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerDef {
    pub beat: f64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartDocument {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub meta: ChartMeta,
    #[serde(default)]
    pub mode: ChartMode,
    #[serde(default = "default_lanes")]
    pub lanes: u32,
    #[serde(default)]
    pub tempo: Vec<TempoPoint>,
    #[serde(default)]
    pub lines: Vec<LineDef>,
    #[serde(default)]
    pub notes: Vec<NoteDef>,
    #[serde(default)]
    pub note_types: Vec<NoteTypeDef>,
    #[serde(default)]
    pub tracks: Vec<TrackDef>,
    #[serde(default)]
    pub triggers: Vec<TriggerDef>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChartError(pub String);

impl std::fmt::Display for ChartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ChartError {}

#[derive(Clone, Debug)]
pub struct CompiledLine {
    pub x: Curve,
    pub y: Curve,
    pub rotation: Curve,
    pub alpha: Curve,
    pub speed: SpeedCurve,
    pub length: f64,
}

/// A compiled note type. Indices 0–3 are the built-in tap, hold, drag and flick; the chart's own follow.
#[derive(Clone, Debug, PartialEq)]
pub struct NoteType {
    pub id: String,
    pub base: NoteKind,
    /// Seconds; None: the session's windows.
    pub windows: Option<[f64; 4]>,
    pub weight: f64,
    pub combo: bool,
    /// An untouched note is judged perfect (notes to avoid) instead of missed.
    pub timeout_perfect: bool,
    pub width: f64,
    pub height: f64,
}

impl NoteType {
    fn builtin(base: NoteKind) -> NoteType {
        NoteType {
            id: base.name().into(),
            base,
            windows: None,
            weight: 1.0,
            combo: true,
            timeout_perfect: false,
            width: 0.0,
            height: 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Track {
    pub target: String,
    pub property: String,
    pub curve: Curve,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Trigger {
    pub time: f64,
    pub beat: f64,
    pub name: String,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Note {
    pub id: usize,
    /// The note's position in the chart file's note list.
    pub source: usize,
    pub kind: NoteKind,
    /// Index into `Chart::types`.
    pub type_index: usize,
    pub size: f64,
    /// Seconds from beat 0.
    pub time: f64,
    pub end_time: f64,
    pub lane: u32,
    pub line: usize,
    pub x: f64,
    pub side: f64,
    pub speed: f64,
    pub floor: f64,
    pub end_floor: f64,
    /// Another note shares this time (drawn highlighted).
    pub simultaneous: bool,
}

#[derive(Clone, Debug)]
pub struct Chart {
    pub mode: ChartMode,
    pub lanes: u32,
    pub meta: ChartMeta,
    pub tempo: TempoMap,
    pub lines: Vec<CompiledLine>,
    /// Sorted by time, then lane/line, then x.
    pub notes: Vec<Note>,
    /// Built-in types first (tap, hold, drag, flick), then the chart's own in file order.
    pub types: Vec<NoteType>,
    /// The master timeline in file order.
    pub tracks: Vec<Track>,
    /// Sorted by time.
    pub triggers: Vec<Trigger>,
    /// Seconds from beat 0 to the end of the last note.
    pub length: f64,
}

fn finite(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn compile_events(
    tempo: &TempoMap,
    defs: &[EventDef],
    what: &str,
) -> Result<Vec<CurveEvent>, ChartError> {
    if defs.len() > MAX_EVENTS_PER_CURVE {
        return Err(ChartError(format!(
            "{what}: more than {MAX_EVENTS_PER_CURVE} events"
        )));
    }
    Ok(defs
        .iter()
        .filter(|e| {
            e.start.is_finite() && e.end.is_finite() && e.from.is_finite() && e.to.is_finite()
        })
        .map(|e| CurveEvent {
            start: tempo.beat_to_time(e.start),
            end: tempo.beat_to_time(e.end.max(e.start)),
            from: e.from,
            to: e.to,
            ease: Easing::parse(&e.ease),
        })
        .collect())
}

fn compile_types(defs: &[NoteTypeDef]) -> Result<Vec<NoteType>, ChartError> {
    if defs.len() > MAX_NOTE_TYPES {
        return Err(ChartError(format!("more than {MAX_NOTE_TYPES} note types")));
    }
    let mut types: Vec<NoteType> = [
        NoteKind::Tap,
        NoteKind::Hold,
        NoteKind::Drag,
        NoteKind::Flick,
    ]
    .into_iter()
    .map(NoteType::builtin)
    .collect();
    for (index, def) in defs.iter().enumerate() {
        let id = def.id.trim();
        if id.is_empty() {
            return Err(ChartError(format!("note type {index}: id is empty")));
        }
        if types.iter().any(|t| t.id == id) {
            return Err(ChartError(format!(
                "note type {index}: id \"{id}\" is already used"
            )));
        }
        let windows = match &def.windows {
            None => None,
            Some(values) if values.len() == 4 && values.iter().all(|v| v.is_finite()) => {
                let mut out = [0.0; 4];
                let mut previous = 0.001;
                for (slot, value) in out.iter_mut().zip(values) {
                    *slot = (value / 1000.0).clamp(previous, 1.0);
                    previous = *slot;
                }
                Some(out)
            }
            Some(_) => {
                return Err(ChartError(format!(
                    "note type \"{id}\": windows are four numbers (milliseconds)"
                )))
            }
        };
        types.push(NoteType {
            id: id.to_string(),
            base: def.base,
            windows,
            weight: finite(def.weight, 1.0).clamp(0.0, 1000.0),
            combo: def.combo,
            timeout_perfect: def.timeout.trim().eq_ignore_ascii_case("perfect"),
            width: finite(def.width, 0.0).max(0.0),
            height: finite(def.height, 0.0).max(0.0),
        });
    }
    Ok(types)
}

impl Chart {
    pub fn parse(json: &str) -> Result<Chart, ChartError> {
        let document: ChartDocument = serde_json::from_str(json)
            .map_err(|error| ChartError(format!("chart JSON: {error}")))?;
        Chart::compile(&document)
    }

    pub fn compile(document: &ChartDocument) -> Result<Chart, ChartError> {
        if document.format != FORMAT {
            return Err(ChartError(format!("format must be \"{FORMAT}\"")));
        }
        if document.version == 0 || document.version > VERSION {
            return Err(ChartError(format!(
                "unsupported chart version {} (this engine reads up to {VERSION})",
                document.version
            )));
        }
        if document.notes.len() > MAX_NOTES {
            return Err(ChartError(format!("more than {MAX_NOTES} notes")));
        }
        if document.lines.len() > MAX_LINES {
            return Err(ChartError(format!("more than {MAX_LINES} judgement lines")));
        }
        let lanes = if document.mode == ChartMode::Lanes {
            document.lanes.clamp(1, 16)
        } else {
            document.lanes.max(1)
        };
        let tempo = TempoMap::new(
            &document
                .tempo
                .iter()
                .map(|p| (p.beat, p.bpm))
                .collect::<Vec<_>>(),
        );
        let mut line_defs = document.lines.clone();
        if line_defs.is_empty() {
            line_defs.push(LineDef::default());
        }
        let mut lines = Vec::with_capacity(line_defs.len());
        for (index, def) in line_defs.iter().enumerate() {
            let what = format!("line {index}");
            lines.push(CompiledLine {
                x: Curve::new(
                    finite(def.x, 0.0),
                    compile_events(&tempo, &def.events.x, &what)?,
                ),
                y: Curve::new(
                    finite(def.y, 0.0),
                    compile_events(&tempo, &def.events.y, &what)?,
                ),
                rotation: Curve::new(
                    finite(def.rotation, 0.0),
                    compile_events(&tempo, &def.events.rotation, &what)?,
                ),
                alpha: Curve::new(
                    finite(def.alpha, 1.0),
                    compile_events(&tempo, &def.events.alpha, &what)?,
                ),
                speed: SpeedCurve::new(
                    finite(def.speed, 1.0),
                    compile_events(&tempo, &def.events.speed, &what)?,
                ),
                length: finite(def.length, default_length()).max(0.0),
            });
        }
        let types = compile_types(&document.note_types)?;
        let mut notes: Vec<Note> = Vec::with_capacity(document.notes.len());
        for (index, def) in document.notes.iter().enumerate() {
            if !def.beat.is_finite() {
                return Err(ChartError(format!("note {index}: beat is not a number")));
            }
            let type_index = match NoteKind::builtin(&def.kind) {
                Some(kind) => kind.code() as usize,
                None => types.iter().position(|t| t.id == def.kind).ok_or_else(|| {
                    ChartError(format!(
                        "note {index}: unknown note type \"{}\" (add it to noteTypes)",
                        def.kind
                    ))
                })?,
            };
            let kind = types[type_index].base;
            let line = if document.mode == ChartMode::Lines {
                def.line as usize
            } else {
                0
            };
            if line >= lines.len() {
                return Err(ChartError(format!(
                    "note {index}: line {} does not exist",
                    def.line
                )));
            }
            if document.mode == ChartMode::Lanes && def.lane >= lanes {
                return Err(ChartError(format!(
                    "note {index}: lane {} is outside 0..{}",
                    def.lane,
                    lanes - 1
                )));
            }
            let time = tempo.beat_to_time(def.beat);
            let end_beat = match (kind, def.end_beat) {
                (NoteKind::Hold, Some(end)) if end.is_finite() && end > def.beat => end,
                (NoteKind::Hold, _) => {
                    return Err(ChartError(format!(
                        "note {index}: a hold needs an endBeat after its beat"
                    )))
                }
                _ => def.beat,
            };
            let end_time = tempo.beat_to_time(end_beat);
            let speed_curve = &lines[line].speed;
            notes.push(Note {
                id: 0,
                source: index,
                kind,
                type_index,
                size: finite(def.size, 1.0).clamp(0.05, 50.0),
                time,
                end_time,
                lane: if document.mode == ChartMode::Lanes {
                    def.lane
                } else {
                    0
                },
                line,
                x: finite(def.x, 0.0),
                side: if def.side < 0.0 { -1.0 } else { 1.0 },
                speed: finite(def.speed, 1.0),
                floor: speed_curve.floor(time),
                end_floor: speed_curve.floor(end_time),
                simultaneous: false,
            });
        }
        notes.sort_by(|a, b| {
            a.time
                .total_cmp(&b.time)
                .then(a.lane.cmp(&b.lane))
                .then(a.line.cmp(&b.line))
                .then(a.x.total_cmp(&b.x))
        });
        for (id, note) in notes.iter_mut().enumerate() {
            note.id = id;
        }
        for index in 0..notes.len() {
            let time = notes[index].time;
            let previous = index > 0 && (notes[index - 1].time - time).abs() < 1e-4;
            let next = index + 1 < notes.len() && (notes[index + 1].time - time).abs() < 1e-4;
            notes[index].simultaneous = previous || next;
        }
        if document.tracks.len() > MAX_TRACKS {
            return Err(ChartError(format!(
                "more than {MAX_TRACKS} timeline tracks"
            )));
        }
        let mut tracks = Vec::with_capacity(document.tracks.len());
        for (index, def) in document.tracks.iter().enumerate() {
            let what = format!("track {index}");
            if def.target.trim().is_empty() || def.property.trim().is_empty() {
                return Err(ChartError(format!(
                    "{what}: a track needs a target and a property"
                )));
            }
            tracks.push(Track {
                target: def.target.trim().to_string(),
                property: def.property.trim().to_string(),
                curve: Curve::new(0.0, compile_events(&tempo, &def.events, &what)?),
            });
        }
        if document.triggers.len() > MAX_TRIGGERS {
            return Err(ChartError(format!("more than {MAX_TRIGGERS} triggers")));
        }
        let mut triggers: Vec<Trigger> = document
            .triggers
            .iter()
            .filter(|t| t.beat.is_finite())
            .map(|t| Trigger {
                time: tempo.beat_to_time(t.beat),
                beat: t.beat,
                name: t.name.trim().replace(['\n', '\r', '\t'], " "),
                value: finite(t.value, 0.0),
            })
            .collect();
        triggers.sort_by(|a, b| a.time.total_cmp(&b.time));
        let length = notes.iter().map(|n| n.end_time).fold(0.0, f64::max);
        Ok(Chart {
            mode: document.mode,
            lanes,
            meta: document.meta.clone(),
            tempo,
            lines,
            notes,
            types,
            tracks,
            triggers,
            length,
        })
    }

    /// Index of the first note at or after `time` (binary search).
    pub fn first_note_at_or_after(&self, time: f64) -> usize {
        self.notes.partition_point(|n| n.time < time)
    }
}
