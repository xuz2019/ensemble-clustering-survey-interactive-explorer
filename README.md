# Ensemble Clustering Review Explorer

Static web companion for the review data in:

- `all_tables.xlsx`
- `mean_average_8Metrics.xlsx`
- `mean_results.xlsx`
- `std_results.xlsx`

The generated page uses only HTML, CSS, JavaScript, and `data/review-data.json`.
It can be hosted directly with GitHub Pages.

## Local Preview

From this folder:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Regenerate Data

From the repository root:

```powershell
python interactive_review_explorer\tools\extract_xlsx_data.py
```

The extractor reads every sheet from the four source workbooks and writes the
normalized plus raw workbook data to `data/review-data.json`.
