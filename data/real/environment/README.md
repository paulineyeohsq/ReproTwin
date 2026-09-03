# Real environmental data

Drop one or more `.csv` files in this folder to switch the app into
**REAL DATA MODE**. Source: Malaysian OpenDOSM / data.gov.my air pollution
datasets (or any file using the same columns).

Expected columns (case-insensitive; extra columns are ignored):

```
location / station / "monitoring location"
date / timestamp / datetime
pm25 / pm2.5
pm10
no2
so2
o3
co
```

Any row missing a timestamp is skipped. Missing pollutant values are
allowed (left as `null`) — the adapter does not require every column.

See `lib/realDataAdapter.ts` for the loader and `README.md` at the project
root for how detected files affect the rest of the app.
