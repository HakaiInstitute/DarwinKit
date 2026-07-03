#' darwinkit: R interface to the DarwinKit Darwin Core validator
#'
#' Build a validation config from data frames with pipeable `dwk_*` verbs, then
#' validate against the `dwkt` engine.
#'
#' @section Canonical pipeline:
#' ```r
#' dwk_init("survey") |>
#'   dwk_dataset("Event", events, required = "eventID", unique = "eventID") |>
#'   dwk_dataset("Occurrence", occurrences) |>
#'   dwk_validate() |>
#'   dwk_summary()
#' ```
#' Standard Darwin Core foreign keys are enforced automatically by the engine.
#'
#' @section Verbs:
#' - **Build:** [dwk_init()], [dwk_null_values()], [dwk_dataset()]
#' - **Validate:** [dwk_validate()], [dwk_is_valid()]
#' - **Report:** [dwk_summary()], [dwk_issues()], [dwk_errors()],
#'   [dwk_warnings()], [dwk_info()], [dwk_ignore()]
#' - **Output:** [dwk_stage()], [dwk_write_csv()]
#' - **Engine:** [dwk_install_engine()]
#'
#' @keywords internal
"_PACKAGE"

# Small helper: return NA when x is NULL, else x (used when flattening JSON).
or_na <- function(x) if (is.null(x)) NA else x
