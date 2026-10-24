//! Nova_A rhythm core (26.46): the chart format, tempo maps, eased line events, scroll positions,
//! judgement and scoring. 26.47: the chart's own note types (custom notes judged by the game), the
//! master timeline (tracks and triggers). Platform independent; the runtime drives it through `nova_wasm`.

pub mod chart;
pub mod curve;
pub mod ease;
pub mod session;
pub mod tempo;

pub use chart::{
    Chart, ChartDocument, ChartError, ChartMode, Note, NoteKind, NoteType, Track, Trigger,
};
pub use ease::Easing;
pub use session::{
    InputEvent, InputKind, JudgeEvent, Judgement, LinePose, NoteDraw, Session, Settings, Stats,
    TouchEvent,
};
pub use tempo::TempoMap;

#[cfg(test)]
mod tests;
