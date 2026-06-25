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
  library(dplyr) # only for the tidy dwk_issues() filtering in section 5
)

# If you built the engine from this repo, point DARWINKIT_BIN at it. (Skip this
# if you already have a `dwkt` on your PATH.)
if (
  Sys.getenv("DARWINKIT_BIN") == "" &&
    file.exists("packages/cli/dist/dwkt-macos")
) {
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
    "Striped seaperch",
    "Leafy hornmouth",
    "Leafy hornmouth",
    "Leafy hornmouth",
    "Rock scallop"
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
# Darwin Core class. The OBIS profile supplies the baseline requirements; pass
# `required`/`unique` to tighten a dataset further - `required` fields must be
# present and non-null, `unique` forbids duplicate IDs. dwk_validate() shells
# out to the dwkt engine.
kit <- dwk_init(
  "rocky-subtidal",
  description = "Demo survey slice",
  standard = "obis"
) |>
  dwk_dataset(
    "events", "Event", events,
    required = c("eventID", "decimalLatitude", "decimalLongitude"),
    unique = "eventID"
  )

report <- dwk_validate(kit)

# Two ways to read a report: print() for the full human view (status header +
# errors then warnings; info hidden, n = Inf for all), and dwk_summary() for a
# compact triage (counts per level + one example of each). Use print() when you
# want the detail, dwk_summary() to glance while iterating.
print(report)
dwk_summary(report)
# For code, reach for the tidy tibbles instead: dwk_issues(report) (every level)
# or dwk_errors(report) / dwk_warnings(report) / dwk_info(report).

# ----------------------------------------------------------------------------
# 3. Add the Occurrences + a foreign key back to Events
# ----------------------------------------------------------------------------
# Verbs return a modified COPY, so we reassign `kit`. dwk_relation() declares
# that every occurrence.eventID must exist in events.eventID.
kit <- kit |>
  dwk_dataset("occurrence", "Occurrence", occ) |>
  dwk_relation("occurrence", "eventID", "events", "eventID")

report <- dwk_validate(kit)
dwk_summary(report) # glance while iterating; print(report) for the full view

# ----------------------------------------------------------------------------
# 4. Add the Measurements (eMOF) + its foreign key
# ----------------------------------------------------------------------------
kit <- kit |>
  dwk_dataset("emof", "ExtendedMeasurementOrFact", emof) |>
  dwk_relation("emof", "eventID", "events", "eventID")

report <- dwk_validate(kit)
dwk_summary(report) # still all valid - the triage is enough while building

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
bad_occ$eventID[2] <- "hakaiFI-NO-SUCH-EVENTS" # orphaned foreign key

broken_kit <- kit |>
  dwk_dataset("events", "Event", bad_events) |>
  dwk_dataset("occurrence", "Occurrence", bad_occ)

broken <- dwk_validate(broken_kit)
print(dwk_is_valid(broken)) # FALSE

# Focused console view: errors then warnings (capped at 25 total, errors
# first; info hidden). Use print(broken, n = Inf) to show everything.
print(broken)

# Quick triage: counts per level + one example of each.
dwk_summary(broken)

# Per-level tidy tibbles (each is a plain tibble, so dplyr still works):
print(dwk_errors(broken)) # errors only
print(dwk_warnings(broken)) # warnings only
print(dwk_info(broken)) # info only

# The full, unfiltered table (every level):
print(dwk_issues(broken))

# dwk_issues() composes with dplyr, e.g. errors for one dataset:
print(dwk_issues(broken) |> filter(level == "error", dataset == "events"))

# ----------------------------------------------------------------------------
# 6. Fix it - and see why immutability makes that easy
# ----------------------------------------------------------------------------
# The original `kit` was never mutated, so re-validating it is green again.
# dwk_is_valid() returns a plain logical, so it's the natural gate in a script
# or CI job - branch on it instead of eyeballing the report.
fixed <- dwk_validate(kit)
if (dwk_is_valid(fixed)) {
  message("All datasets valid - ready to stage and submit.")
} else {
  print(fixed) # show what still needs fixing
  stop("Validation failed.")
}

# ----------------------------------------------------------------------------
# 7. Keep the artifacts
# ----------------------------------------------------------------------------
# In a pipeline you'd usually reach this only after dwk_is_valid() passes (see
# section 6). Stage a portable shadow workspace (Parquet + darwinkit.yaml) you
# can commit and re-run in CI with `dwkt validate --config darwinkit/darwinkit.yaml`:
dwk_stage(kit, "darwinkit/")

# Or write submission-ready CSVs (every column stringified, NA -> ""):
dwk_write_csv(kit, "csv/")

cat("\nDemo complete.\n")
