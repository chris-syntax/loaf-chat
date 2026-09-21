import UIKit

/// The screen shown when something the app depends on did not come up --
/// the bundled server failed to bind any candidate port, or the service
/// worker did not reach `activated` + controller presence.
///
/// Its entire reason to exist is the "Error handling" section of
/// docs/superpowers/specs/2026-09-20-ios-client-design.md: "nothing fails
/// silently into an app that looks fine." A blank or white WKWebView after
/// one of these failures would look like a slow network, not a broken
/// service worker -- exactly the trap that cost the spike a false negative.
/// This is deliberately plain UIKit with no WKWebView involved, so it can
/// never itself be the thing silently failing.
final class NativeErrorViewController: UIViewController {
    private let title_: String
    private let detail: String
    private let retryHandler: (() -> Void)?

    init(title: String, detail: String, retryHandler: (() -> Void)? = nil) {
        self.title_ = title
        self.detail = detail
        self.retryHandler = retryHandler
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let icon = UIImageView(image: UIImage(systemName: "exclamationmark.triangle.fill"))
        icon.tintColor = .systemOrange
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = title_
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.numberOfLines = 0
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let detailLabel = UILabel()
        detailLabel.text = detail
        detailLabel.font = .preferredFont(forTextStyle: .body)
        detailLabel.textColor = .secondaryLabel
        detailLabel.numberOfLines = 0
        detailLabel.textAlignment = .center
        detailLabel.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [icon, titleLabel, detailLabel])
        stack.axis = .vertical
        stack.spacing = 16
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 44),
            icon.heightAnchor.constraint(equalToConstant: 44),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -32),
        ])

        if let retryHandler = retryHandler {
            let button = UIButton(type: .system)
            button.setTitle("Retry", for: .normal)
            button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
            button.addAction(UIAction { _ in retryHandler() }, for: .touchUpInside)
            button.translatesAutoresizingMaskIntoConstraints = false
            stack.addArrangedSubview(button)
        }

        // SPIKE_ERROR_SCREEN / print marker so `xcrun simctl launch --console`
        // output makes it unambiguous, from the log alone, that this is the
        // screen showing rather than a webview that merely rendered blank.
        print("LOAF_NATIVE_ERROR_SCREEN title=\(title_) detail=\(detail)")
    }
}
