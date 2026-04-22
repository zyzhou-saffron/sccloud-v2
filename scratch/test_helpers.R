source("r-engine/plumber.R")

# Test make_output_name
cat("Testing make_output_name...\n")
name <- make_output_name("/data/projects/p1", 2, "normalize", "SCT", "rds")
cat("Generated Name: ", name, "\n")
if (grepl("^/data/projects/p1/p1_.*_2\\.normalize_SCT\\.rds$", name)) {
  cat("SUCCESS\n")
} else {
  cat("FAILURE\n")
}

# Test save_with_canonical (mocking saveRDS)
cat("\nTesting save_with_canonical (Mocking)...\n")
# Create a dummy file
dir.create("test_project", showWarnings = FALSE)
dummy_obj <- list(a=1)
archive <- "test_project/p1_2024_2.norm.rds"
canonical <- "test_project/normalize.rds"

# Mock saveRDS to actually save
save_with_canonical(archive, canonical, dummy_obj)

if (file.exists(archive) && file.exists(canonical)) {
  cat("SUCCESS: Both files exist\n")
  # Check if they are the same
  if (file.size(archive) == file.size(canonical)) {
    cat("SUCCESS: Sizes match\n")
  }
} else {
  cat("FAILURE: Files missing\n")
}

# Clean up
unlink("test_project", recursive = TRUE)
