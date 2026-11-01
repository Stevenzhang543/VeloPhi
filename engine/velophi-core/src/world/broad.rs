//! Broad phase of the many-body solver (26.58, D128): sort and sweep along x. The sort key is (min x, body
//! index) — a total order — so the sorted order, and with it the candidate list, does not depend on the order
//! kept from the previous step; that order only makes the insertion sort fast. Candidate pairs come out sorted by
//! (smaller index, larger index).

/// Sort-and-sweep state: the body order of the previous step (performance only, never part of a result).
#[derive(Clone, Debug, Default)]
pub struct Sweep {
    order: Vec<usize>,
    active: Vec<usize>,
}

impl Sweep {
    /// Candidate pairs among the boxes (min x, min y, max x, max y); `skip(i)` leaves a box out entirely and
    /// `keep(i, j)` (i < j) filters pairs. The result is sorted.
    pub fn pairs(&mut self, boxes: &[[f64; 4]], skip: impl Fn(usize) -> bool, keep: impl Fn(usize, usize) -> bool, out: &mut Vec<(usize, usize)>) {
        out.clear();
        let n = boxes.len();
        if self.order.len() != n {
            self.order = (0..n).collect();
        }
        let less = |a: usize, b: usize| boxes[a][0] < boxes[b][0] || (boxes[a][0] == boxes[b][0] && a < b);
        // insertion sort, nearly linear when the order changes little between steps
        for i in 1..n {
            let cur = self.order[i];
            let mut j = i;
            while j > 0 && less(cur, self.order[j - 1]) {
                self.order[j] = self.order[j - 1];
                j -= 1;
            }
            self.order[j] = cur;
        }
        self.active.clear();
        for k in 0..n {
            let i = self.order[k];
            if skip(i) {
                continue;
            }
            let bi = boxes[i];
            self.active.retain(|&a| boxes[a][2] >= bi[0]);
            for &a in &self.active {
                let ba = boxes[a];
                if ba[1] <= bi[3] && bi[1] <= ba[3] {
                    let (lo, hi) = if a < i { (a, i) } else { (i, a) };
                    if keep(lo, hi) {
                        out.push((lo, hi));
                    }
                }
            }
            self.active.push(i);
        }
        out.sort_unstable();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_pairs_as_brute_force_in_any_start_order() {
        let mut boxes = Vec::new();
        let mut seed = 12345u64;
        let mut rnd = || {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (seed >> 11) as f64 / (1u64 << 53) as f64
        };
        for _ in 0..200 {
            let x = rnd() * 10.0;
            let y = rnd() * 10.0;
            let w = 0.1 + rnd() * 0.6;
            boxes.push([x, y, x + w, y + w]);
        }
        let mut brute = Vec::new();
        for i in 0..boxes.len() {
            for j in i + 1..boxes.len() {
                let (a, b) = (boxes[i], boxes[j]);
                if a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3] {
                    brute.push((i, j));
                }
            }
        }
        let mut s = Sweep::default();
        let mut out = Vec::new();
        s.pairs(&boxes, |_| false, |_, _| true, &mut out);
        assert_eq!(out, brute);
        // a different remembered order gives the same result
        s.order.reverse();
        s.pairs(&boxes, |_| false, |_, _| true, &mut out);
        assert_eq!(out, brute);
    }
}
