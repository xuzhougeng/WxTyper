import AppKit
import SwiftUI

struct EditorTextView: NSViewRepresentable {
    @Binding var text: String
    @Binding var selectedRange: NSRange

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder

        let textView = NSTextView()
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.allowsUndo = true
        textView.font = .monospacedSystemFont(ofSize: 14, weight: .regular)
        textView.textContainerInset = NSSize(width: 18, height: 16)
        textView.string = text
        textView.autoresizingMask = [.width]
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        textView.setAccessibilityLabel("Markdown 编辑器")
        scrollView.documentView = textView
        context.coordinator.textView = textView
        context.coordinator.prepareInitialPosition(in: scrollView)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let textView = context.coordinator.textView else { return }
        if textView.string != text {
            textView.string = text
            let length = (text as NSString).length
            let location = min(selectedRange.location, length)
            let selectionLength = min(selectedRange.length, max(0, length - location))
            let range = NSRange(location: location, length: selectionLength)
            textView.setSelectedRange(range)
            textView.scrollRangeToVisible(range)
        }
        context.coordinator.prepareInitialPosition(in: scrollView)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: EditorTextView
        weak var textView: NSTextView?
        private var didScheduleInitialPosition = false

        init(parent: EditorTextView) { self.parent = parent }

        func prepareInitialPosition(in scrollView: NSScrollView) {
            guard !didScheduleInitialPosition, let textView else { return }
            didScheduleInitialPosition = true
            DispatchQueue.main.async {
                let length = (textView.string as NSString).length
                let location = min(self.parent.selectedRange.location, length)
                let selectionLength = min(self.parent.selectedRange.length, max(0, length - location))
                let range = NSRange(location: location, length: selectionLength)
                textView.setSelectedRange(range)
                textView.scrollRangeToVisible(range)
                if location == 0 {
                    scrollView.contentView.scroll(to: .zero)
                    scrollView.reflectScrolledClipView(scrollView.contentView)
                }
                textView.window?.makeFirstResponder(textView)
            }
        }

        func textDidChange(_ notification: Notification) {
            guard let textView else { return }
            parent.text = textView.string
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let textView else { return }
            parent.selectedRange = textView.selectedRange()
        }
    }
}
