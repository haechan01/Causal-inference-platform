"""
Convert nls.dat (Card 1994 fixed-width ASCII) to nls.csv

Codebook: "Using Geographic Variation in College Proximity to Estimate
the Return to Schooling" - David Card, NBER WP 4832 (1994)

3613 observations on men in 1976 cross-section of NLS Young Men cohort.
Missing value code in raw file is '.'  -> converted to empty string in CSV.
"""

import csv
import os

# ---------------------------------------------------------------------------
# Column spec: (start_col, end_col, variable_name, description)
# Columns are 1-based in the codebook; Python slices are 0-based.
# ---------------------------------------------------------------------------
COLUMNS = [
    (1,   5,   "id",       "sequential id 1-5225"),
    (7,   7,   "nearc2",   "grew up near 2-yr college"),
    (10,  10,  "nearc4",   "grew up near 4-yr college"),
    (12,  13,  "nearc4a",  "grew up near 4-yr public college"),
    (15,  16,  "nearc4b",  "grew up near 4-yr priv college"),
    (18,  19,  "ed76",     "educ in 1976"),
    (21,  22,  "ed66",     "educ in 1966"),
    (24,  25,  "age76",    "age in 1976"),
    (27,  31,  "daded",    "dads education missing=avg"),
    (33,  33,  "nodaded",  "1 if dad ed imputed"),
    (35,  39,  "momed",    "moms education"),
    (41,  41,  "nomomed",  "1 if mom ed imputed"),
    (43,  54,  "weight",   "nls weight for 1976 cross-section"),
    (56,  56,  "momdad14", "1 if live with mom and dad age 14"),
    (58,  58,  "sinmom14", "lived with single mom age 14"),
    (60,  60,  "step14",   "lived with step parent age 14"),
    (62,  62,  "reg661",   "dummy for region=1 in 1966"),
    (64,  64,  "reg662",   "dummy for region=2 in 1966"),
    (66,  66,  "reg663",   "dummy for region=3 in 1966"),
    (68,  68,  "reg664",   "dummy for region=4 in 1966"),
    (70,  70,  "reg665",   "dummy for region=5 in 1966"),
    (72,  72,  "reg666",   "dummy for region=6 in 1966"),
    (74,  74,  "reg667",   "dummy for region=7 in 1966"),
    (76,  76,  "reg668",   "dummy for region=8 in 1966"),
    (78,  78,  "reg669",   "dummy for region=9 in 1966"),
    (80,  80,  "south66",  "lived in south in 1966"),
    (82,  82,  "work76",   "worked in 1976"),
    (84,  84,  "work78",   "worked in 1978"),
    (86,  97,  "lwage76",  "log wage (outliers trimmed) 1976"),
    (99,  110, "lwage78",  "log wage in 1978 outliers trimmed"),
    (112, 112, "famed",    "mom-dad education class 1-9"),
    (114, 114, "black",    "1 if black"),
    (116, 116, "smsa76r",  "in smsa in 1976"),
    (118, 118, "smsa78r",  "in smsa in 1978"),
    (120, 120, "reg76r",   "in south in 1976"),
    (122, 122, "reg78r",   "in south in 1978"),
    (124, 124, "reg80r",   "in south in 1980"),
    (126, 126, "smsa66r",  "in smsa in 1966"),
    (128, 132, "wage76",   "raw wage cents per hour 1976"),
    (134, 138, "wage78",   "raw wage cents per hour 1978"),
    (140, 144, "wage80",   "raw wage cents per hour 1980"),
    (146, 146, "noint78",  "1 if noninterview in 78"),
    (148, 148, "noint80",  "1 if noninterview in 80"),
    (150, 150, "enroll76", "1 if enrolled in 76"),
    (152, 152, "enroll78", "1 if enrolled in 78"),
    (154, 154, "enroll80", "1 if enrolled in 80"),
    (156, 157, "kww",      "KWW score"),
    (159, 161, "iq",       "normed IQ score"),
    (163, 163, "marsta76", "mar status 1976 1=married sp present"),
    (165, 165, "marsta78", "mar status 1978"),
    (167, 167, "marsta80", "mar status 1980"),
    (169, 169, "libcrd14", "1 if lib card in home age 14"),
]


def _header_with_famed_dummies():
    """
    Column names: Card (1993) uses f1–f8 dummies from famed (1–8);
    famed==9 is the omitted reference category.
    """
    names = []
    for col in COLUMNS:
        names.append(col[2])
        if col[2] == "famed":
            for i in range(1, 9):
                names.append(f"f{i}")
    return names


HEADER = _header_with_famed_dummies()

# Index of famed in the raw fixed-width row (before inserting f1–f8)
FAMED_COL_INDEX = [col[2] for col in COLUMNS].index("famed")


def _famed_dummy_values(famed_str: str) -> list[str]:
    """f_i = 1 iff famed == i (i=1..8); empty/missing famed -> all zeros."""
    if not famed_str or famed_str.strip() == "":
        return ["0"] * 8
    try:
        v = int(float(famed_str.strip()))
    except ValueError:
        return ["0"] * 8
    return ["1" if v == i else "0" for i in range(1, 9)]


def extract_value(line, start, end):
    """
    Extract a fixed-width field (1-based cols) from a raw line.
    Returns empty string if the field is missing ('.') or blank.
    """
    # Convert to 0-based Python slice
    s = start - 1
    e = end  # end is inclusive in codebook, so slice end = end
    if e > len(line):
        return ""
    field = line[s:e].strip()
    if field == "." or field == "":
        return ""
    return field


def convert(dat_path, csv_path):
    skipped = 0
    written = 0

    with open(dat_path, "r") as fin, open(csv_path, "w", newline="") as fout:
        writer = csv.writer(fout)
        writer.writerow(HEADER)

        for lineno, raw in enumerate(fin, start=1):
            # Skip blank lines
            line = raw.rstrip("\n")
            if not line.strip():
                skipped += 1
                continue

            row = [extract_value(line, s, e) for s, e, *_ in COLUMNS]
            dummies = _famed_dummy_values(row[FAMED_COL_INDEX])
            cut = FAMED_COL_INDEX + 1
            row = row[:cut] + dummies + row[cut:]
            writer.writerow(row)
            written += 1

    print(f"Done. Lines written: {written}, blank lines skipped: {skipped}")
    print(f"Output: {csv_path}")


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    dat_path = os.path.join(base, "nls.dat")
    csv_path = os.path.join(base, "nls.csv")
    convert(dat_path, csv_path)
