// Entry point for run-tests. Swift requires top-level statements to live in
// a file literally named main.swift when compiling more than one file
// together; the actual checks live alongside in *Tests.swift.
runAllBundleServerTests()
runAllSSOFlowTests()
reportAndExit()
