# Real mobility data

Drop one or more `.csv` files in this folder to switch the app into
**REAL DATA MODE**. Suggested source: the Greater Kuala Lumpur Mobilities
dataset, described here as real-world urban mobility trajectory data (not
attributed to any delivery platform). Any GPS trace using the same columns
works.

Expected columns (case-insensitive; extra columns are ignored):

```
timestamp
latitude / lat
longitude / lng / lon
speed
bearing / heading
trip_id
route_id
```

See `lib/realDataAdapter.ts` for the loader and `README.md` at the project
root for how detected files affect the rest of the app.
