use crate::chart::{Chart, ChartMode, NoteKind};
use crate::curve::{Curve, CurveEvent, SpeedCurve};
use crate::ease::{Easing, Shape};
use crate::session::{InputEvent, InputKind, Judgement, Session, Settings};
use crate::tempo::TempoMap;

fn close(a: f64, b: f64, tolerance: f64) -> bool {
    (a - b).abs() <= tolerance
}

#[test]
fn tempo_map_converts_across_bpm_changes() {
    let map = TempoMap::new(&[(0.0, 120.0), (4.0, 60.0)]);
    assert!(close(map.beat_to_time(4.0), 2.0, 1e-12));
    assert!(close(map.beat_to_time(6.0), 4.0, 1e-12));
    assert!(close(map.time_to_beat(4.0), 6.0, 1e-12));
    assert!(
        close(map.beat_to_time(-2.0), -1.0, 1e-12),
        "the first tempo extends before beat 0"
    );
    assert!(close(map.bpm_at_time(3.0), 60.0, 0.0));
    for beat in [-3.0, 0.0, 1.25, 4.0, 5.5, 100.0] {
        assert!(close(map.time_to_beat(map.beat_to_time(beat)), beat, 1e-9));
    }
    // A first tempo point after beat 0 is extended back; invalid points are dropped.
    let late = TempoMap::new(&[(2.0, 150.0), (8.0, f64::NAN), (9.0, 0.0)]);
    assert!(close(late.beat_to_time(2.0), 0.8, 1e-12));
    assert_eq!(TempoMap::new(&[]).bpm_at_time(10.0), 120.0);
}

#[test]
fn easings_match_the_tween_curves() {
    let names = [
        "linear",
        "quad_in",
        "quad_out",
        "quad_in_out",
        "cubic_in",
        "cubic_out",
        "cubic_in_out",
        "quart_in",
        "quart_out",
        "quart_in_out",
        "quint_in",
        "quint_out",
        "quint_in_out",
        "sine_in",
        "sine_out",
        "sine_in_out",
        "expo_in",
        "expo_out",
        "expo_in_out",
        "circ_in",
        "circ_out",
        "circ_in_out",
        "back_in",
        "back_out",
        "back_in_out",
        "elastic_in",
        "elastic_out",
        "elastic_in_out",
        "bounce_in",
        "bounce_out",
        "bounce_in_out",
    ];
    for name in names {
        let ease = Easing::parse(name);
        assert!(
            close(ease.apply(0.0), 0.0, 1e-9) && close(ease.apply(1.0), 1.0, 1e-9),
            "{name} keeps its end points"
        );
    }
    assert_eq!(Easing::parse("EaseOutQuad"), Easing::Out(Shape::Quad));
    assert_eq!(
        Easing::parse("ease-in-out-back"),
        Easing::InOut(Shape::Back)
    );
    assert_eq!(Easing::parse("nonsense"), Easing::Linear);
    assert!(close(Easing::parse("quad_out").apply(0.5), 0.75, 1e-12));
    assert!(close(
        Easing::parse("sine_in_out").apply(0.25),
        0.146_446_609_406_726_2,
        1e-12
    ));
    assert!(close(
        Easing::parse("bounce_out").apply(0.5),
        0.765_625,
        1e-12
    ));
    assert_eq!(Easing::parse("step").apply(0.99), 0.0);
}

#[test]
fn curves_hold_values_between_events() {
    let curve = Curve::new(
        5.0,
        vec![
            CurveEvent {
                start: 1.0,
                end: 2.0,
                from: 0.0,
                to: 10.0,
                ease: Easing::Linear,
            },
            CurveEvent {
                start: 3.0,
                end: 4.0,
                from: 10.0,
                to: -10.0,
                ease: Easing::Linear,
            },
        ],
    );
    assert_eq!(
        curve.value(0.0),
        0.0,
        "before the first event: its start value"
    );
    assert!(close(curve.value(1.5), 5.0, 1e-12));
    assert_eq!(
        curve.value(2.5),
        10.0,
        "between events: the previous end value"
    );
    assert!(close(curve.value(3.25), 5.0, 1e-12));
    assert_eq!(curve.value(9.0), -10.0);
    assert_eq!(Curve::constant(2.0).value(100.0), 2.0);
}

#[test]
fn floor_position_integrates_the_speed() {
    let constant = SpeedCurve::new(2.0, Vec::new());
    assert!(close(constant.floor(3.0), 6.0, 1e-12));
    // Speed 1 → 3 linearly over [0, 2], then 3: floor(2) = 4, floor(3) = 7.
    let ramp = SpeedCurve::new(
        1.0,
        vec![CurveEvent {
            start: 0.0,
            end: 2.0,
            from: 1.0,
            to: 3.0,
            ease: Easing::Linear,
        }],
    );
    assert!(close(ramp.floor(2.0), 4.0, 1e-12));
    assert!(close(ramp.floor(3.0), 7.0, 1e-12));
    assert!(
        close(ramp.floor(-1.0), -1.0, 1e-12),
        "before the first event at its start speed"
    );
    // An eased change integrates numerically: compare with a fine Riemann sum.
    let eased = SpeedCurve::new(
        1.0,
        vec![CurveEvent {
            start: 1.0,
            end: 3.0,
            from: 0.0,
            to: 4.0,
            ease: Easing::parse("sine_in_out"),
        }],
    );
    let mut sum = 0.0;
    let steps = 200_000;
    for k in 0..steps {
        let t = (k as f64 + 0.5) * 3.0 / steps as f64;
        sum += eased.speed(t) * 3.0 / steps as f64;
    }
    assert!(
        close(eased.floor(3.0), sum, 2e-3),
        "eased integral {} vs {}",
        eased.floor(3.0),
        sum
    );
    // A stop and a reverse.
    let reverse = SpeedCurve::new(
        1.0,
        vec![
            CurveEvent {
                start: 0.0,
                end: 1.0,
                from: 1.0,
                to: 1.0,
                ease: Easing::Linear,
            },
            CurveEvent {
                start: 1.0,
                end: 2.0,
                from: 0.0,
                to: 0.0,
                ease: Easing::Linear,
            },
            CurveEvent {
                start: 2.0,
                end: 3.0,
                from: -1.0,
                to: -1.0,
                ease: Easing::Linear,
            },
        ],
    );
    assert!(close(reverse.floor(1.5), 1.0, 1e-12));
    assert!(close(reverse.floor(3.0), 0.0, 1e-12));
}

const LANES: &str = r#"{
  "format": "nova-chart", "version": 1, "mode": "lanes", "lanes": 4,
  "meta": { "title": "Test", "offsetMs": 0 },
  "tempo": [{ "beat": 0, "bpm": 120 }],
  "notes": [
    { "type": "tap", "beat": 2, "lane": 0 },
    { "type": "tap", "beat": 4, "lane": 1 },
    { "type": "tap", "beat": 4, "lane": 2 },
    { "type": "hold", "beat": 6, "endBeat": 8, "lane": 3 },
    { "type": "tap", "beat": 10, "lane": 0 }
  ]
}"#;

fn key(kind: InputKind, time: f64, lane: i32) -> InputEvent {
    InputEvent {
        kind,
        time,
        id: 1000 + lane as i64,
        x: 0.0,
        y: 0.0,
        lane,
        keyboard: true,
    }
}

#[test]
fn charts_compile_and_report_errors() {
    let chart = Chart::parse(LANES).expect("valid chart");
    assert_eq!(chart.mode, ChartMode::Lanes);
    assert_eq!(chart.notes.len(), 5);
    assert!(close(chart.notes[0].time, 1.0, 1e-12));
    assert!(
        chart.notes[1].simultaneous && chart.notes[2].simultaneous && !chart.notes[0].simultaneous
    );
    assert!(close(chart.length, 5.0, 1e-12));
    let bad = |json: &str| Chart::parse(json).err().map(|e| e.0).unwrap_or_default();
    assert!(bad(r#"{"format":"other","version":1}"#).contains("format"));
    assert!(bad(r#"{"format":"nova-chart","version":9}"#).contains("version"));
    assert!(
        bad(r#"{"format":"nova-chart","version":1,"notes":[{"type":"hold","beat":1}]}"#)
            .contains("endBeat")
    );
    assert!(bad(r#"{"format":"nova-chart","version":1,"lanes":4,"notes":[{"type":"tap","beat":1,"lane":7}]}"#).contains("lane"));
    assert!(bad(r#"{"format":"nova-chart","version":1,"mode":"lines","notes":[{"type":"tap","beat":1,"line":3}]}"#).contains("line"));
}

#[test]
fn autoplay_is_a_full_combo() {
    let mut session = Session::new(
        Chart::parse(LANES).unwrap(),
        Settings {
            autoplay: true,
            ..Settings::default()
        },
    );
    let mut events = Vec::new();
    let mut t = -1.0;
    while t < 7.0 {
        events.extend(session.advance(t, &[]));
        t += 1.0 / 60.0;
    }
    assert!(session.finished());
    assert_eq!(session.stats.counts, [5, 0, 0, 0, 0]);
    assert_eq!(session.stats.max_combo, 5);
    assert_eq!(session.score(), 1_000_000.0);
    assert_eq!(
        events.iter().filter(|e| e.hold_end).count(),
        1,
        "the hold reports its end"
    );
}

#[test]
fn key_presses_are_judged_by_their_timestamps() {
    let settings = Settings {
        windows: [0.045, 0.09, 0.135, 0.18],
        ..Settings::default()
    };
    let mut session = Session::new(Chart::parse(LANES).unwrap(), settings);
    // Note 0 at 1.0 s in lane 0: pressed 70 ms late, judged in the frame after.
    let result = session.advance(
        1.1,
        &[
            key(InputKind::Press, 1.07, 0),
            key(InputKind::Release, 1.09, 0),
        ],
    );
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].judgement, Judgement::Great);
    assert!(close(result[0].offset, 0.07, 1e-9));
    // Notes 1 and 2 at 2.0 s: one perfect, one missed (lane 2 never pressed); a press 400 ms early does nothing.
    assert!(session
        .advance(
            1.6,
            &[
                key(InputKind::Press, 1.6, 1),
                key(InputKind::Release, 1.61, 1)
            ]
        )
        .is_empty());
    let result = session.advance(
        2.3,
        &[
            key(InputKind::Press, 1.99, 1),
            key(InputKind::Release, 2.05, 1),
        ],
    );
    assert_eq!(
        result.iter().map(|e| e.judgement).collect::<Vec<_>>(),
        vec![Judgement::Perfect, Judgement::Miss]
    );
    assert_eq!(session.stats.combo, 0);
    // The hold (3.0 → 4.0 s, lane 3): held to the end.
    let result = session.advance(
        4.2,
        &[
            key(InputKind::Press, 3.02, 3),
            key(InputKind::Release, 3.95, 3),
        ],
    );
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].judgement, Judgement::Perfect);
    assert!(result[1].hold_end && result[1].judgement == Judgement::Perfect);
    // The last tap (5.0 s): a bad hit breaks the combo.
    let result = session.advance(5.3, &[key(InputKind::Press, 5.16, 0)]);
    assert_eq!(result[0].judgement, Judgement::Bad);
    assert_eq!(session.stats.counts, [2, 1, 0, 1, 1]);
    assert_eq!(session.stats.max_combo, 2);
    assert!(session.finished());
    assert!(session.score() > 0.0 && session.score() < 1_000_000.0);
    assert!(
        session.stats.mean_offset() > 0.0,
        "the player was late on average"
    );
}

#[test]
fn releasing_a_hold_early_breaks_it() {
    let mut session = Session::new(Chart::parse(LANES).unwrap(), Settings::default());
    session.seek(2.9);
    let result = session.advance(
        3.6,
        &[
            key(InputKind::Press, 3.0, 3),
            key(InputKind::Release, 3.4, 3),
        ],
    );
    assert_eq!(
        result
            .iter()
            .map(|e| (e.judgement, e.hold_end))
            .collect::<Vec<_>>(),
        vec![(Judgement::Perfect, false), (Judgement::Miss, true)]
    );
    assert_eq!(
        session.stats.counts[0], 0,
        "the head no longer counts as perfect"
    );
    assert_eq!(session.stats.counts[4], 1);
    assert_eq!(session.stats.combo, 0);
}

const LINES: &str = r#"{
  "format": "nova-chart", "version": 1, "mode": "lines",
  "tempo": [{ "beat": 0, "bpm": 60 }],
  "lines": [
    { "x": 0, "y": -2, "rotation": 0, "events": { "rotation": [{ "start": 0, "end": 2, "from": 0, "to": 90, "ease": "linear" }], "speed": [{ "start": 0, "end": 10, "from": 1, "to": 1 }] } },
    { "x": 0, "y": 3, "rotation": 0 }
  ],
  "notes": [
    { "type": "tap", "beat": 2, "line": 0, "x": 2 },
    { "type": "drag", "beat": 3, "line": 1, "x": -1 },
    { "type": "flick", "beat": 4, "line": 1, "x": 1 },
    { "type": "tap", "beat": 5, "line": 1, "x": 0, "side": -1 }
  ]
}"#;

fn touch(kind: InputKind, time: f64, id: i64, x: f64, y: f64) -> InputEvent {
    InputEvent {
        kind,
        time,
        id,
        x,
        y,
        lane: -1,
        keyboard: false,
    }
}

#[test]
fn touches_are_matched_on_moving_lines() {
    let mut session = Session::new(
        Chart::parse(LINES).unwrap(),
        Settings {
            hit_width: 1.0,
            flick_speed: 10.0,
            ..Settings::default()
        },
    );
    // At 2 s line 0 has turned 90°: x = 2 along it is the point (0, 0). A touch at (2, -2) is far away.
    assert!(session
        .advance(
            2.0,
            &[
                touch(InputKind::Press, 2.0, 1, 2.0, -2.0),
                touch(InputKind::Release, 2.01, 1, 2.0, -2.0)
            ]
        )
        .is_empty());
    let result = session.advance(
        2.1,
        &[
            touch(InputKind::Press, 2.02, 2, 0.05, 0.0),
            touch(InputKind::Release, 2.05, 2, 0.05, 0.0),
        ],
    );
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].judgement, Judgement::Perfect);
    assert!(
        close(result[0].x, 0.0, 1e-9) && close(result[0].y, 0.0, 1e-9),
        "the hit is where the note met its line"
    );
    // The drag at 3 s on line 1 (y = 3) at x = -1: a finger resting there is enough.
    let result = session.advance(3.05, &[touch(InputKind::Press, 2.9, 3, -1.2, 3.0)]);
    assert_eq!(result.len(), 1);
    assert_eq!(
        (result[0].kind, result[0].judgement),
        (NoteKind::Drag, Judgement::Perfect)
    );
    // The flick at 4 s needs a fast movement near x = 1.
    let result = session.advance(
        4.05,
        &[
            touch(InputKind::Move, 3.98, 3, 0.9, 3.0),
            touch(InputKind::Move, 4.0, 3, 1.3, 3.4),
        ],
    );
    assert_eq!(result.len(), 1);
    assert_eq!(
        (result[0].kind, result[0].judgement),
        (NoteKind::Flick, Judgement::Perfect)
    );
    // The last tap on the keyboard (desktop play): any key hits the next note.
    let result = session.advance(
        5.1,
        &[InputEvent {
            kind: InputKind::Press,
            time: 5.03,
            id: 99,
            x: 0.0,
            y: 0.0,
            lane: -1,
            keyboard: true,
        }],
    );
    assert_eq!(result[0].judgement, Judgement::Perfect);
    assert!(session.finished());
}

#[test]
fn the_frame_places_notes_by_scroll_distance() {
    let session = Session::new(
        Chart::parse(LINES).unwrap(),
        Settings {
            scroll: 2.0,
            ..Settings::default()
        },
    );
    let (lines, notes) = session.frame(1.0);
    assert_eq!(lines.len(), 2);
    assert!(close(lines[0].rotation, 45.0, 1e-9));
    let first = notes
        .iter()
        .find(|n| n.id == 0)
        .expect("the first note is drawn");
    assert!(
        close(first.distance, 2.0, 1e-9),
        "one second away at scroll 2"
    );
    let below = notes
        .iter()
        .find(|n| n.id == 3)
        .expect("the last note is drawn");
    assert!(
        below.distance < 0.0,
        "notes from below have negative distances"
    );
    // Lanes: x is the lane centre, y the judgement line plus the distance.
    let lanes = Session::new(
        Chart::parse(LANES).unwrap(),
        Settings {
            scroll: 4.0,
            lane_width: 1.0,
            judge_y: -3.0,
            ..Settings::default()
        },
    );
    let (_, notes) = lanes.frame(0.5);
    let n0 = notes.iter().find(|n| n.id == 0).unwrap();
    assert!(close(n0.x, -1.5, 1e-9) && close(n0.y, -1.0, 1e-9));
    let hold = notes.iter().find(|n| n.id == 3).unwrap();
    assert!(
        close(hold.body, 4.0, 1e-9),
        "a two-beat hold at 120 BPM and scroll 4 is 4 units long"
    );
}

// ---------------------------------------------------------------- 26.47: note types, timeline

const TYPED: &str = r#"{
  "format": "nova-chart", "version": 2, "mode": "lanes", "lanes": 4,
  "tempo": [{ "beat": 0, "bpm": 120 }],
  "noteTypes": [
    { "id": "star", "name": "Star", "base": "tap", "weight": 2, "windows": [20, 40, 60, 80] },
    { "id": "mine", "base": "custom", "weight": 0, "timeout": "perfect" },
    { "id": "ghost", "base": "tap", "combo": false, "weight": 0 },
    { "id": "wide", "base": "tap", "width": 4.8 }
  ],
  "notes": [
    { "type": "tap", "beat": 2, "lane": 0 },
    { "type": "star", "beat": 4, "lane": 1 },
    { "type": "mine", "beat": 6, "lane": 2, "data": { "damage": 3 } },
    { "type": "ghost", "beat": 8, "lane": 3 },
    { "type": "wide", "beat": 10, "lane": 0, "size": 1 }
  ],
  "tracks": [
    { "target": "Background", "property": "x", "events": [{ "start": 4, "end": 8, "from": 0, "to": 10, "ease": "linear" }] },
    { "target": "camera", "property": "zoom", "events": [] }
  ],
  "triggers": [{ "beat": 8, "name": "drop", "value": 2 }, { "beat": 2, "name": "intro" }]
}"#;

#[test]
fn note_types_compile_with_their_own_rules() {
    let chart = Chart::parse(TYPED).expect("valid typed chart");
    assert_eq!(
        chart.types.len(),
        8,
        "four built-in types and four of the chart's own"
    );
    let star = &chart.types[chart.notes[1].type_index];
    assert_eq!(star.id, "star");
    assert_eq!(star.windows, Some([0.02, 0.04, 0.06, 0.08]));
    assert_eq!(chart.notes[2].kind, NoteKind::Custom);
    assert_eq!(chart.notes[2].source, 2);
    assert_eq!(
        chart.triggers[0].name, "intro",
        "triggers are sorted by time"
    );
    assert_eq!(chart.tracks.len(), 2);
    let bad = |json: &str| Chart::parse(json).err().map(|e| e.0).unwrap_or_default();
    assert!(
        bad(r#"{"format":"nova-chart","version":2,"notes":[{"type":"bomb","beat":1}]}"#)
            .contains("unknown note type")
    );
    assert!(
        bad(r#"{"format":"nova-chart","version":2,"noteTypes":[{"id":"tap"}]}"#)
            .contains("already used")
    );
    assert!(
        bad(r#"{"format":"nova-chart","version":2,"noteTypes":[{"id":"x","windows":[1,2]}]}"#)
            .contains("windows")
    );
    assert!(
        bad(r#"{"format":"nova-chart","version":2,"tracks":[{"target":"","property":"x"}]}"#)
            .contains("track 0")
    );
    // Version 1 charts still read, with every note on a built-in type.
    let v1 = Chart::parse(LANES).unwrap();
    assert!(v1.notes.iter().all(|n| n.type_index < 4));
    assert_eq!(v1.types.len(), 4);
}

#[test]
fn type_weights_combo_and_timeouts_score_as_declared() {
    let mut session = Session::new(Chart::parse(TYPED).unwrap(), Settings::default());
    // tap at 1.0 perfect, star at 2.0 hit 50 ms late (great by the component, good by its own windows).
    session.advance(1.01, &[key(InputKind::Press, 1.0, 0)]);
    let star = session.advance(2.06, &[key(InputKind::Press, 2.05, 1)]);
    assert_eq!(
        star[0].judgement,
        Judgement::Good,
        "the star's own windows apply"
    );
    assert_eq!(star[0].type_index, 4);
    // The mine at 3.0 is never touched: its window passes and it counts as perfect, weight 0.
    // The ghost at 4.0 is missed: no weight, no combo break. The wide note at 5.0 is hit by a pointer
    // two lanes away (its type is 4.8 units wide).
    let lane_x = session.lane_x(0);
    let mut events = session.advance(4.5, &[]);
    events.extend(session.advance(
        5.3,
        &[InputEvent {
            kind: InputKind::Press,
            time: 5.0,
            id: 7,
            x: lane_x + 2.2,
            y: -3.5,
            lane: -1,
            keyboard: false,
        }],
    ));
    let judged: Vec<(usize, Judgement)> =
        events.iter().map(|e| (e.type_index, e.judgement)).collect();
    assert_eq!(
        judged,
        vec![
            (5, Judgement::Perfect),
            (6, Judgement::Miss),
            (7, Judgement::Perfect)
        ]
    );
    assert!(session.finished());
    assert_eq!(
        session.stats.combo, 4,
        "the ghost's miss does not break the combo"
    );
    // Weights: tap 1 + star 2 (good, 0.5) + wide 1 = 4 of 4 scored weight → accuracy (1 + 1 + 1) / 4.
    assert!(close(session.accuracy(), 0.75, 1e-12));
    // Combo notes: tap, star, mine, wide (4), max combo 4.
    assert_eq!(session.score(), (900_000.0_f64 * 0.75 + 100_000.0).round());
}

#[test]
fn custom_notes_report_touches_and_take_script_judgements() {
    let json = r#"{
      "format": "nova-chart", "version": 2, "mode": "lanes", "lanes": 2,
      "tempo": [{ "beat": 0, "bpm": 60 }],
      "noteTypes": [{ "id": "gesture", "base": "custom" }],
      "notes": [
        { "type": "gesture", "beat": 1, "lane": 0 },
        { "type": "gesture", "beat": 2, "lane": 1 },
        { "type": "tap", "beat": 1, "lane": 0 }
      ]
    }"#;
    let mut session = Session::new(Chart::parse(json).unwrap(), Settings::default());
    // A press at 1.03 in lane 0 hits the tap and is reported for the custom note too (not consumed).
    let events = session.advance(1.04, &[key(InputKind::Press, 1.03, 0)]);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, NoteKind::Tap);
    let touches = session.take_touches();
    assert_eq!(touches.len(), 1);
    assert_eq!(touches[0].note, 0);
    assert!(close(touches[0].offset, 0.03, 1e-9));
    assert!(session.take_touches().is_empty(), "touches are taken once");
    // The script judges it by its offset (great with the default windows) …
    assert!(session.judge_note(touches[0].note, None, touches[0].offset + 0.05));
    assert!(
        !session.judge_note(0, Some(Judgement::Perfect), 0.0),
        "a note is judged once"
    );
    let judged = session.advance(1.1, &[]);
    assert_eq!(judged.len(), 1);
    assert_eq!(judged[0].judgement, Judgement::Great);
    // … and a custom note nobody judges is missed when its window has passed.
    let late = session.advance(2.3, &[]);
    assert_eq!(late.len(), 1);
    assert_eq!(late[0].judgement, Judgement::Miss);
    assert!(session.finished());
    // Autoplay judges custom notes perfect on time.
    let mut auto = Session::new(
        Chart::parse(json).unwrap(),
        Settings {
            autoplay: true,
            ..Settings::default()
        },
    );
    let mut all = Vec::new();
    for step in 0..200 {
        all.extend(auto.advance(step as f64 / 60.0, &[]));
    }
    assert_eq!(auto.stats.counts, [3, 0, 0, 0, 0]);
    assert_eq!(auto.score(), 1_000_000.0);
    assert_eq!(all.len(), 3);
}

#[test]
fn timeline_tracks_and_triggers_follow_the_chart_time() {
    let mut session = Session::new(Chart::parse(TYPED).unwrap(), Settings::default());
    // Background x: 0 → 10 between beats 4 and 8 (2 s → 4 s); NaN before (the object keeps its value).
    assert!(session.track_values(1.0)[0].is_nan());
    assert!(close(session.track_values(3.0)[0], 5.0, 1e-9));
    assert!(close(session.track_values(9.0)[0], 10.0, 1e-9));
    assert!(
        session.track_values(3.0)[1].is_nan(),
        "a track without events never applies"
    );
    // Triggers fire once each, in order, as the clock passes them.
    session.seek(-2.0);
    session.advance(0.5, &[]);
    assert!(session.take_triggers().is_empty());
    session.advance(1.0, &[]);
    assert_eq!(session.take_triggers(), vec![0]);
    session.advance(3.99, &[]);
    assert!(session.take_triggers().is_empty());
    session.advance(6.0, &[]);
    assert_eq!(session.take_triggers(), vec![1]);
    session.advance(7.0, &[]);
    assert!(session.take_triggers().is_empty(), "no trigger fires twice");
    // A seek back starts again from the first trigger at or after the new time.
    session.seek(3.0);
    session.advance(4.0, &[]);
    assert_eq!(session.take_triggers(), vec![1]);
    let trigger = &session.chart.triggers[1];
    assert_eq!(
        (trigger.name.as_str(), trigger.value, trigger.beat),
        ("drop", 2.0, 8.0)
    );
}
