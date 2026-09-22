import ObjectiveC
import UIKit
import WebKit

extension WKWebView {
    /// Removes the form accessory bar -- the capsule carrying previous/next
    /// arrows and a Done button that WebKit puts above the keyboard.
    ///
    /// Measured at 68px between the composer and the keyboard, and in a chat
    /// app it is pure noise: there is one field, so the field-stepping arrows
    /// have nothing to step through, and dismissal is already a tap away in
    /// the timeline.
    ///
    /// There is no API for this. WKWebView puts the keyboard's responder on a
    /// private `WKContentView`, and the only lever is its
    /// `inputAccessoryView` getter, so this builds a subclass at runtime that
    /// returns nil and swaps the instance over to it. The class is created
    /// once and reused; if the lookup ever fails -- WebKit renames the view,
    /// say -- nothing happens and the accessory bar simply comes back, which
    /// is a cosmetic regression rather than a broken app.
    ///
    /// Testing note: with the Simulator's "Connect Hardware Keyboard" on
    /// (⇧⌘K), tapping a field shows only this bar -- so with the bar removed,
    /// *nothing* appears, which looks exactly like this code broke the
    /// keyboard. It did not. Turn the hardware keyboard off before judging.
    ///
    /// Acceptable here because Loaf Chat is not going through App Review
    /// (distribution is TestFlight; see the design doc's non-goals). It would
    /// need re-evaluating if that ever changed.
    func removeInputAccessoryView() {
        guard let target = scrollView.subviews.first(where: {
            String(describing: type(of: $0)).hasPrefix("WKContent")
        }) else {
            print("LOAF_ACCESSORY_SKIPPED no WKContentView found")
            return
        }

        let subclassName = "\(type(of: target))_LoafNoInputAccessory"

        if let existing = NSClassFromString(subclassName) {
            object_setClass(target, existing)
            return
        }

        guard
            let targetClass = object_getClass(target),
            let subclass = objc_allocateClassPair(targetClass, subclassName, 0)
        else {
            print("LOAF_ACCESSORY_SKIPPED could not create \(subclassName)")
            return
        }

        let returnsNil: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        class_addMethod(
            subclass,
            #selector(getter: UIResponder.inputAccessoryView),
            imp_implementationWithBlock(returnsNil),
            "@@:"
        )
        objc_registerClassPair(subclass)
        object_setClass(target, subclass)
        print("LOAF_ACCESSORY_REMOVED")
    }
}
