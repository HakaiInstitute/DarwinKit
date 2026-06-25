default_runner <- function(bin, args) {
  out <- processx::run(bin, args, error_on_status = FALSE)
  list(stdout = out$stdout, stderr = out$stderr, status = out$status)
}

#' Validate a kit with the DarwinKit engine
#'
#' Stages the kit as a shadow workspace (Parquet + `darwinkit.yaml`), runs
#' `dwkt validate --format json`, and parses the result. The `dwkt` binary is
#' resolved from `bin`, then the `DARWINKIT_BIN` environment variable, then
#' the PATH; if none resolve, an error explains how to install it.
#'
#' @param kit A `dwk_kit` with at least one dataset.
#' @param stage_dir Optional directory to stage into (kept afterwards —
#'   commit it to git or inspect the generated config). Defaults to a fresh
#'   temporary directory.
#' @param bin Optional explicit path to the `dwkt` binary.
#' @param runner Subprocess runner, exposed for testing. A
#'   `function(bin, args)` returning `list(stdout, stderr, status)`.
#' @return A `dwk_report`; see [dwk_is_valid()] and [dwk_issues()].
#' @examples
#' \dontrun{
#' report <- dwk_init("survey") |>
#'   dwk_dataset("events", "Event", events_df) |>
#'   dwk_validate()
#' dwk_issues(report)
#' }
#' @export
dwk_validate <- function(kit, stage_dir = NULL, bin = NULL, runner = NULL) {
  check_dwk_kit(kit, "dwk_validate")
  check_stageable(kit)
  if (!is.null(stage_dir)) check_string(stage_dir, "stage_dir", "dwk_validate")

  cfg <- stage_datasets(stage_dir %||% tempfile("dwkt-"), kit)

  # Only resolve a real binary for the default runner. An injected runner
  # (test seam) owns its own bin, so we don't force resolution (which would
  # raise install guidance when no binary is present).
  run <- runner %||% default_runner
  resolved_bin <- if (is.null(runner)) {
    resolve_dwkt_bin(bin = bin)
  } else {
    bin %||% "dwkt"
  }

  out <- run(resolved_bin, c("validate", "--config", cfg, "--format", "json"))
  if (!nzchar(out$stdout)) {
    stop(
      sprintf("dwkt produced no output (status %s): %s", out$status, out$stderr),
      call. = FALSE
    )
  }
  parsed <- tryCatch(
    jsonlite::fromJSON(out$stdout, simplifyVector = FALSE),
    error = function(e) {
      stop(
        sprintf(
          "dwkt did not return JSON (status %s).\nstdout: %s\nstderr: %s",
          out$status, substr(out$stdout, 1, 200), out$stderr
        ),
        call. = FALSE
      )
    }
  )
  if (is.null(parsed$datasetResults)) {
    stop(
      sprintf(
        "dwkt returned JSON without datasetResults (status %s): %s",
        out$status, substr(out$stdout, 1, 200)
      ),
      call. = FALSE
    )
  }
  new_dwk_report(parse_report(parsed), name = kit$name)
}
