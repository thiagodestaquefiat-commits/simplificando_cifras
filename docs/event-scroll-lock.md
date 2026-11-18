# Event detail scroll isolation

Bug: an empty/short event can reach its scroll boundary immediately. The fixed event view had overscroll containment, but the underlying document remained scrollable, allowing mobile scroll/bounce to move the events page behind it.

Fix: event-scroll-lock.js observes the existing detail-view open/closed lifecycle. While it is open, body is fixed at the saved document offset and root overflow is locked. Closing through Back or another route restores the previous inline styles and document position. Re-rendering the event preserves the same lock. Event CSS uses overscroll-behavior-y:none and retains native touch scrolling inside the detail. No preventDefault handlers, permission changes or changes to repertoire content.

Validation: Chrome CDP touch gestures plus mouse wheel on empty events at 375/390/820px, with a genuinely scrollable events list behind. Background position remains fixed; closing restores it. Long repertoire still scrolls inside the event. Closing by route/style also releases the lock. event-footer-spacing-ui, event-participants-morph and index-syntax pass. Actual Safari hardware was not available in this test; fixed-body locking is included for mobile browsers where boundary containment alone is insufficient.
