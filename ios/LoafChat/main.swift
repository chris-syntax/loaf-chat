import UIKit
import Darwin

// stdout is fully-buffered when not attached to a tty (i.e. when simctl
// redirects it to a file/pipe). Force unbuffered so our print() lines show
// up immediately instead of sitting in a 4KB buffer that may never fill.
// Proven necessary during the spike; carried over unchanged.
setvbuf(stdout, nil, _IONBF, 0)

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
