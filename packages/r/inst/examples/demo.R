#!/usr/bin/env Rscript
# demo.R - A guided tour of the {darwinkit} R workflow
# ============================================================================
# Run me from the REPOSITORY ROOT, either top-to-bottom:
#
#     Rscript packages/r/inst/examples/demo.R
#
# or line-by-line in RStudio. The script builds a small slice of the Hakai
# Rocky Subtidal Fish & Invertebrate survey column by column, assembles it into
# Darwin Core datasets, and validates each step through the real `dwkt` engine -
# including catching and fixing a deliberate error.
#
# Prerequisite: the `dwkt` engine binary.
#   * Released builds: see packages/r/README.md (curl from GitHub releases).
#   * From this repo:  deno task --cwd packages/cli compile:macos
#                      (writes packages/cli/dist/dwkt-macos)
# Point the package at it with the DARWINKIT_BIN env var (handled just below for
# the in-repo build), or put a `dwkt` binary on your PATH.
# ============================================================================

# Load the package. Once it is installed (devtools::install("packages/r")) this
# is simply `library(darwinkit)`. Running from a checkout without installing, we
# fall back to loading it from source.
if (requireNamespace("darwinkit", quietly = TRUE)) {
  library(darwinkit)
} else {
  pkgload::load_all("packages/r", quiet = TRUE)
}
suppressPackageStartupMessages(
  library(dplyr) # only for the tidy dwk_issues() filtering near the end
)

# If you built the engine from this repo, point DARWINKIT_BIN at it. (Skip this
# if you already have a `dwkt` on your PATH.)
if (Sys.getenv("DARWINKIT_BIN") == "" &&
  file.exists("packages/cli/dist/dwkt-macos")) {
  Sys.setenv(DARWINKIT_BIN = normalizePath("packages/cli/dist/dwkt-macos"))
}

# ----------------------------------------------------------------------------
# 1. Build the data, one column at a time
# ----------------------------------------------------------------------------
# Real workflows usually start from a data frame you already have. Here we
# hand-build three small tables so you can see exactly which Darwin Core terms
# each column maps to.

# -- Events: where/when sampling happened (a dive survey + its two transects) --
events <- tibble::tibble(
  eventID = c(
    "hakaiFI-Second_r-2017-06-22",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish"
  ),
  parentEventID = c(
    NA,
    "hakaiFI-Second_r-2017-06-22",
    "hakaiFI-Second_r-2017-06-22"
  ),
  eventDate = c("2017-06-22", "2017-06-22", "2017-06-22"),
  decimalLatitude = c(51.64848, 51.64848, 51.64848),
  decimalLongitude = c(-128.15595, -128.15595, -128.15595),
  geodeticDatum = "WGS84",
  countryCode = "CA",
  samplingProtocol = paste0(
    "https://github.com/HakaiInstitute/rocky-subtidal-fish-invertebrate/",
    "blob/main/docs/Protocol.pdf"
  )
)

# -- Occurrences: which taxa were seen, each tied to an event by eventID --
occ <- tibble::tibble(
  occurrenceID = c(
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish-occ-819",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert-occ-700",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert-occ-701",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert-occ-702",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert-occ-711"
  ),
  eventID = c(
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert"
  ),
  scientificName = c(
    "Embiotoca lateralis Agassiz, 1854",
    "Ceratostoma foliatum (Gmelin, 1791)",
    "Ceratostoma foliatum (Gmelin, 1791)",
    "Ceratostoma foliatum (Gmelin, 1791)",
    "Crassadoma gigantea (J. E. Gray, 1825)"
  ),
  vernacularName = c(
    "Striped seaperch", "Leafy hornmouth", "Leafy hornmouth",
    "Leafy hornmouth", "Rock scallop"
  ),
  kingdom = "Animalia",
  occurrenceStatus = "present",
  individualCount = c(1, 1, 1, 1, 1),
  basisOfRecord = "HumanObservation"
)

# -- Measurements (eMOF): values attached to an event/occurrence --
emof <- tibble::tibble(
  measurementID = c(
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish-705",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert-occ-700-700",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert-occ-701-701",
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish-occ-819-819"
  ),
  eventID = c(
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
    "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
    "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish"
  ),
  measurementType = c("visibility", "length", "length", "total_length"),
  measurementValue = c("4", "2", "5", "16"),
  measurementUnit = c("meters", "centimeters", "centimeters", "centimeters")
)

# Rscript does not auto-print top-level expressions the way the console does, so
# we print() everything we want to see.
print(events)
print(occ)
print(emof)

# ----------------------------------------------------------------------------
# 2. Validate the Events on their own
# ----------------------------------------------------------------------------
# dwk_init() starts an (immutable) kit; dwk_dataset() registers a table under a
# Darwin Core class. `required` fields must be present and non-null; `unique`
# forbids duplicate IDs. dwk_validate() shells out to the dwkt engine.
kit <- dwk_init("rocky-subtidal",
  description = "Demo survey slice", standard = "obis"
) |>
  dwk_dataset(
    "events", "Event", events,
    required = c("eventID", "eventDate", "decimalLatitude", "decimalLongitude"),
    unique = "eventID"
  )

report <- dwk_validate(kit)
print(report) # per-dataset summary
print(dwk_is_valid(report)) # overall TRUE/FALSE
print(dwk_issues(report)) # tidy tibble of every issue (warnings/info here)

# ----------------------------------------------------------------------------
# 3. Add the Occurrences + a foreign key back to Events
# ----------------------------------------------------------------------------
# Verbs return a modified COPY, so we reassign `kit`. dwk_relation() declares
# that every occurrence.eventID must exist in events.eventID.
kit <- kit |>
  dwk_dataset(
    "occurrence", "Occurrence", occ,
    required = c(
      "occurrenceID", "eventID", "scientificName",
      "basisOfRecord", "occurrenceStatus"
    ),
    unique = "occurrenceID"
  ) |>
  dwk_relation("occurrence", "eventID", "events", "eventID")

report <- dwk_validate(kit)
print(report)
print(dwk_is_valid(report))

# ----------------------------------------------------------------------------
# 4. Add the Measurements (eMOF) + its foreign key
# ----------------------------------------------------------------------------
kit <- kit |>
  dwk_dataset(
    "emof", "ExtendedMeasurementOrFact", emof,
    required = c(
      "measurementID", "eventID", "measurementType", "measurementValue"
    ),
    unique = "measurementID"
  ) |>
  dwk_relation("emof", "eventID", "events", "eventID")

report <- dwk_validate(kit)
print(report) # three datasets
print(dwk_is_valid(report)) # TRUE

# ----------------------------------------------------------------------------
# 5. Watch the engine catch real problems
# ----------------------------------------------------------------------------
# Break two things: an impossible latitude, and an occurrence pointing at an
# event that does not exist. Because the verbs are immutable, we build a
# SEPARATE `broken_kit` - the original `kit` above is left untouched.
bad_events <- events
bad_events$decimalLatitude[1] <- 200 # latitude must be within [-90, 90]

bad_occ <- occ
bad_occ$eventID[1] <- "hakaiFI-NO-SUCH-EVENT" # orphaned foreign key

broken_kit <- kit |>
  dwk_dataset("events", "Event", bad_events,
    required = c("eventID", "eventDate", "decimalLatitude", "decimalLongitude"),
    unique = "eventID"
  ) |>
  dwk_dataset("occurrence", "Occurrence", bad_occ,
    required = c(
      "occurrenceID", "eventID", "scientificName",
      "basisOfRecord", "occurrenceStatus"
    ),
    unique = "occurrenceID"
  )

broken <- dwk_validate(broken_kit)
print(dwk_is_valid(broken)) # FALSE

# dwk_issues() is a plain tibble, so dplyr works. Show just the errors:
print(dwk_issues(broken) |> filter(level == "error"))

# ----------------------------------------------------------------------------
# 6. Fix it - and see why immutability makes that easy
# ----------------------------------------------------------------------------
# The original `kit` was never mutated, so re-validating it is green again.
fixed <- dwk_validate(kit)
print(dwk_is_valid(fixed)) # TRUE

# ----------------------------------------------------------------------------
# 7. Keep the artifacts
# ----------------------------------------------------------------------------
# Stage a portable shadow workspace (Parquet + darwinkit.yaml) you can commit
# and re-run in CI with `dwkt validate --config darwinkit/darwinkit.yaml`:
dwk_stage(kit, "darwinkit/")

# Or write submission-ready CSVs (every column stringified, NA -> ""):
dwk_write_csv(kit, "output/")

cat("\nDemo complete.\n")
