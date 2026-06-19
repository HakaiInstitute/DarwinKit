#' Write kit datasets as submission-ready CSVs
#'
#' Every column is stringified and `NA` becomes the empty string, matching
#' the flat-text shape expected by IPT/OBIS submission tooling.
#'
#' @param kit A `dwk_kit`.
#' @param dir Output directory (created if needed).
#' @param datasets Optional character vector of dataset names; defaults to all.
#' @return The kit, invisibly (for piping).
#' @examples
#' \dontrun{
#' kit |> dwk_write_csv("output/")
#' }
#' @export
dwk_write_csv <- function(kit, dir, datasets = NULL) {
  check_dwk_kit(kit, "dwk_write_csv")
  check_string(dir, "dir", "dwk_write_csv")
  targets <- datasets %||% names(kit$datasets)
  unknown <- setdiff(targets, names(kit$datasets))
  if (length(unknown) > 0) {
    stop(
      sprintf(
        "Unknown dataset(s): %s. Known datasets: %s.",
        paste(unknown, collapse = ", "),
        paste(names(kit$datasets), collapse = ", ")
      ),
      call. = FALSE
    )
  }
  dir.create(dir, recursive = TRUE, showWarnings = FALSE)
  for (nm in targets) {
    df <- kit$datasets[[nm]]$data
    df[] <- lapply(df, function(col) {
      col <- as.character(col)
      col[is.na(col)] <- ""
      col
    })
    utils::write.csv(df, file.path(dir, paste0(nm, ".csv")),
      row.names = FALSE, na = ""
    )
  }
  invisible(kit)
}
