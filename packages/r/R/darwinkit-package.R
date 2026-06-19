#' darwinkit: R interface to the DarwinKit Darwin Core validator
#'
#' @keywords internal
"_PACKAGE"

# Small helper: return NA when x is NULL, else x (used when flattening JSON).
or_na <- function(x) if (is.null(x)) NA else x
