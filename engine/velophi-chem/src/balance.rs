//! Chemical formulas and the balancing of equations (26.64, D267: the symbolic representation).
//!
//! A formula is read into element counts and a charge: `CaCO3`, `Ca(OH)2`, `CuSO4·5H2O` (also `.` or `:` for the
//! dot), `[Cu(NH3)4]2+`, `SO4^2-`, `Fe3+`, `e-`, and the ids of the species database (`SO4-2`, `Fe+3`,
//! `H(Acetate)`), whose composition is taken from the data. Balancing is linear algebra on integers: the
//! coefficients are the null space of the composition matrix (one row per element, one for charge); it is solved
//! exactly with rational numbers, and the answer is the smallest positive integers — or the statement that the
//! equation cannot be balanced, or that it has more than one independent solution.

use std::collections::BTreeMap;

use crate::db::Database;

/// Composition of a formula: element → count (numerator, denominator kept as f64 only at the boundary), and charge.
#[derive(Clone, Debug, PartialEq)]
pub struct Composition {
    pub elements: BTreeMap<String, i64>,
    pub charge: i64,
}

/// Why a formula could not be read.
#[derive(Clone, Debug, PartialEq)]
pub struct FormulaError(pub String);

fn digits(chars: &[char], i: &mut usize) -> Option<i64> {
    let start = *i;
    while *i < chars.len() && chars[*i].is_ascii_digit() {
        *i += 1;
    }
    if *i == start {
        None
    } else {
        chars[start..*i].iter().collect::<String>().parse().ok()
    }
}

fn group(chars: &[char], i: &mut usize, close: Option<char>) -> Result<BTreeMap<String, i64>, FormulaError> {
    let mut out: BTreeMap<String, i64> = BTreeMap::new();
    while *i < chars.len() {
        let ch = chars[*i];
        if Some(ch) == close {
            *i += 1;
            return Ok(out);
        }
        if ch == '(' || ch == '[' {
            *i += 1;
            let inner = group(chars, i, Some(if ch == '(' { ')' } else { ']' }))?;
            let n = digits(chars, i).unwrap_or(1);
            for (k, v) in inner {
                *out.entry(k).or_insert(0) += v * n;
            }
        } else if ch.is_ascii_uppercase() {
            let mut symbol = String::from(ch);
            *i += 1;
            while *i < chars.len() && chars[*i].is_ascii_lowercase() {
                symbol.push(chars[*i]);
                *i += 1;
            }
            let n = digits(chars, i).unwrap_or(1);
            *out.entry(symbol).or_insert(0) += n;
        } else {
            return Err(FormulaError(chars[*i..].iter().collect()));
        }
    }
    if close.is_some() {
        return Err(FormulaError("unbalanced bracket".to_string()));
    }
    Ok(out)
}

/// Read a formula written the way a chemist writes it.
pub fn parse_formula(text: &str) -> Result<Composition, FormulaError> {
    let cleaned: String = text.trim().chars().filter(|c| !c.is_whitespace()).map(|c| match c {
        '−' | '–' | '⁻' => '-',
        '⁺' => '+',
        '·' | '•' | '∙' | ':' => '.',
        '₀'..='₉' => char::from(b'0' + (c as u32 - '₀' as u32) as u8),
        '⁰' => '0',
        '¹' => '1',
        '²' => '2',
        '³' => '3',
        '⁴'..='⁹' => char::from(b'4' + (c as u32 - '⁴' as u32) as u8),
        other => other,
    }).collect();
    if cleaned == "e-" || cleaned == "e" {
        return Ok(Composition { elements: BTreeMap::new(), charge: -1 });
    }
    // The charge: a trailing sign with digits before or after it, optionally behind "^"
    let chars: Vec<char> = cleaned.chars().collect();
    let mut end = chars.len();
    let mut charge = 0i64;
    if end > 0 {
        let mut k = end;
        while k > 0 && chars[k - 1].is_ascii_digit() {
            k -= 1;
        }
        let after: Option<i64> = if k < end { chars[k..end].iter().collect::<String>().parse().ok() } else { None };
        if k > 0 && (chars[k - 1] == '+' || chars[k - 1] == '-') {
            // "SO4-2", "Fe+3", "Na+", "Cl-"
            let sign = if chars[k - 1] == '+' { 1 } else { -1 };
            let mut body_end = k - 1;
            let mut magnitude = after;
            if magnitude.is_none() {
                // "Fe3+", "SO4^2-", "[Cu(NH3)4]2+": digits before the sign belong to the charge only after "^" or "]"
                let mut d = body_end;
                while d > 0 && chars[d - 1].is_ascii_digit() {
                    d -= 1;
                }
                if d < body_end && d > 0 && (chars[d - 1] == '^' || chars[d - 1] == ']' || chars[d - 1] == ')') {
                    magnitude = chars[d..body_end].iter().collect::<String>().parse().ok();
                    body_end = d;
                } else if d < body_end && d > 0 && chars[d - 1] == '^' {
                    body_end = d;
                }
            }
            if body_end > 0 && chars[body_end - 1] == '^' {
                body_end -= 1;
            }
            charge = sign * magnitude.unwrap_or(1);
            end = body_end;
        }
    }
    let body: Vec<char> = chars[..end].to_vec();
    let mut elements: BTreeMap<String, i64> = BTreeMap::new();
    for part in body.split(|c| *c == '.') {
        if part.is_empty() {
            continue;
        }
        let mut i = 0;
        let multiplier = digits(part, &mut i).unwrap_or(1);
        let g = group(part, &mut i, None)?;
        for (k, v) in g {
            *elements.entry(k).or_insert(0) += v * multiplier;
        }
    }
    if elements.is_empty() {
        return Err(FormulaError(text.to_string()));
    }
    Ok(Composition { elements, charge })
}

/// Composition of a term of an equation: a species of the database by id, else a formula.
pub fn composition(db: Option<&Database>, text: &str) -> Result<Composition, FormulaError> {
    if let Some(db) = db {
        if let Some(i) = db.find(text.trim()) {
            let s = &db.species[i];
            if s.comp.iter().all(|c| (c.1 - c.1.round()).abs() < 1e-9) {
                return Ok(Composition { elements: s.comp.iter().map(|(k, v)| (k.clone(), v.round() as i64)).collect(), charge: s.z.round() as i64 });
            }
        }
    }
    parse_formula(text)
}

fn gcd(a: i128, b: i128) -> i128 {
    let (mut a, mut b) = (a.abs(), b.abs());
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

/// A rational number in lowest terms with a positive denominator.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Q(i128, i128);

impl Q {
    fn new(n: i128, d: i128) -> Q {
        let g = gcd(n, d).max(1);
        let s = if d < 0 { -1 } else { 1 };
        Q(s * n / g, s * d / g)
    }
    fn sub(self, o: Q) -> Q {
        Q::new(self.0 * o.1 - o.0 * self.1, self.1 * o.1)
    }
    fn mul(self, o: Q) -> Q {
        Q::new(self.0 * o.0, self.1 * o.1)
    }
    fn div(self, o: Q) -> Q {
        Q::new(self.0 * o.1, self.1 * o.0)
    }
    fn zero(self) -> bool {
        self.0 == 0
    }
}

/// Outcome of balancing.
#[derive(Clone, Debug, PartialEq)]
pub enum Balance {
    /// Smallest positive integer coefficients, reactants first.
    Balanced(Vec<i64>),
    /// No positive solution exists (an element appears on one side only, or the charges cannot match).
    Impossible,
    /// More than one independent solution: the equation is a sum of independent reactions.
    NotUnique(usize),
}

/// Balance `reactants → products`.
pub fn balance(reactants: &[Composition], products: &[Composition]) -> Balance {
    let n = reactants.len() + products.len();
    if reactants.is_empty() || products.is_empty() {
        return Balance::Impossible;
    }
    let mut rows: BTreeMap<String, Vec<Q>> = BTreeMap::new();
    let mut charge = vec![Q(0, 1); n];
    for (k, c) in reactants.iter().chain(products.iter()).enumerate() {
        let sign = if k < reactants.len() { 1 } else { -1 };
        for (el, &v) in &c.elements {
            rows.entry(el.clone()).or_insert_with(|| vec![Q(0, 1); n])[k] = Q((sign * v) as i128, 1);
        }
        charge[k] = Q((sign * c.charge) as i128, 1);
    }
    let mut m: Vec<Vec<Q>> = rows.into_values().collect();
    if charge.iter().any(|q| !q.zero()) {
        m.push(charge);
    }
    // Reduced row echelon form
    let mut pivots: Vec<usize> = Vec::new();
    let mut r = 0;
    for c in 0..n {
        let Some(p) = (r..m.len()).find(|&i| !m[i][c].zero()) else { continue };
        m.swap(r, p);
        let d = m[r][c];
        for x in m[r].iter_mut() {
            *x = x.div(d);
        }
        for i in 0..m.len() {
            if i != r && !m[i][c].zero() {
                let f = m[i][c];
                let row = m[r].clone();
                for (x, y) in m[i].iter_mut().zip(row.iter()) {
                    *x = x.sub(f.mul(*y));
                }
            }
        }
        pivots.push(c);
        r += 1;
        if r == m.len() {
            break;
        }
    }
    let free: Vec<usize> = (0..n).filter(|c| !pivots.contains(c)).collect();
    if free.is_empty() {
        return Balance::Impossible;
    }
    if free.len() > 1 {
        return Balance::NotUnique(free.len());
    }
    // One free column: set it to 1, read the others, clear denominators
    let fc = free[0];
    let mut x = vec![Q(0, 1); n];
    x[fc] = Q(1, 1);
    for (i, &pc) in pivots.iter().enumerate() {
        x[pc] = Q(0, 1).sub(m[i][fc]);
    }
    let lcm = x.iter().fold(1i128, |l, q| l / gcd(l, q.1).max(1) * q.1);
    let mut ints: Vec<i128> = x.iter().map(|q| q.0 * (lcm / q.1)).collect();
    let g = ints.iter().fold(0i128, |g, v| gcd(g, *v)).max(1);
    for v in ints.iter_mut() {
        *v /= g;
    }
    if ints.iter().all(|v| *v < 0) {
        for v in ints.iter_mut() {
            *v = -*v;
        }
    }
    if ints.iter().any(|v| *v <= 0) || ints.iter().any(|v| *v > i64::MAX as i128) {
        return Balance::Impossible;
    }
    Balance::Balanced(ints.into_iter().map(|v| v as i64).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solve(reactants: &[&str], products: &[&str]) -> Balance {
        let parse = |list: &[&str]| list.iter().map(|f| parse_formula(f).unwrap_or_else(|e| panic!("{f}: {e:?}"))).collect::<Vec<_>>();
        balance(&parse(reactants), &parse(products))
    }

    #[test]
    fn formulas() {
        let c = parse_formula("CuSO4·5H2O").unwrap();
        assert_eq!((c.elements["Cu"], c.elements["S"], c.elements["O"], c.elements["H"], c.charge), (1, 1, 9, 10, 0));
        assert_eq!(parse_formula("SO4^2-").unwrap().charge, -2);
        assert_eq!(parse_formula("SO4-2").unwrap().charge, -2);
        assert_eq!(parse_formula("Fe3+").unwrap(), Composition { elements: [("Fe".to_string(), 3)].into_iter().collect(), charge: 1 });
        assert_eq!(parse_formula("Fe^3+").unwrap(), Composition { elements: [("Fe".to_string(), 1)].into_iter().collect(), charge: 3 });
        assert_eq!(parse_formula("Fe+3").unwrap().charge, 3);
        let c = parse_formula("[Cu(NH3)4]2+").unwrap();
        assert_eq!((c.elements["Cu"], c.elements["N"], c.elements["H"], c.charge), (1, 4, 12, 2));
        assert_eq!(parse_formula("Ca(OH)2").unwrap().elements["O"], 2);
        assert_eq!(parse_formula("NH₄⁺").unwrap().charge, 1);
        assert!(parse_formula("xyz").is_err());
    }

    #[test]
    fn equations() {
        assert_eq!(solve(&["H2", "O2"], &["H2O"]), Balance::Balanced(vec![2, 1, 2]));
        assert_eq!(solve(&["KMnO4", "HCl"], &["KCl", "MnCl2", "Cl2", "H2O"]), Balance::Balanced(vec![2, 16, 2, 2, 5, 8]));
        assert_eq!(solve(&["MnO4-", "Fe+2", "H+"], &["Mn+2", "Fe+3", "H2O"]), Balance::Balanced(vec![1, 5, 8, 1, 5, 4]));
        assert_eq!(solve(&["Cu", "HNO3"], &["Cu(NO3)2", "NO", "H2O"]), Balance::Balanced(vec![3, 8, 3, 2, 4]));
        assert_eq!(solve(&["C2H5OH", "O2"], &["CO2", "H2O"]), Balance::Balanced(vec![1, 3, 2, 3]));
        assert_eq!(solve(&["Al", "Fe2O3"], &["Al2O3", "Fe"]), Balance::Balanced(vec![2, 1, 1, 2]));
        assert_eq!(solve(&["Cr2O7^2-", "Fe^2+", "H+"], &["Cr^3+", "Fe^3+", "H2O"]), Balance::Balanced(vec![1, 6, 14, 2, 6, 7]));
        assert_eq!(solve(&["H2"], &["O2"]), Balance::Impossible);
        // Copper with nitric acid giving both oxides of nitrogen: two independent reactions
        assert_eq!(solve(&["Cu", "HNO3"], &["Cu(NO3)2", "NO", "NO2", "H2O"]), Balance::NotUnique(2));
    }
}
