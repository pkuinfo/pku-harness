## type.unseen_pasted
The element list has no field here, so the text was pasted into the box that holds focus and checked against the text read from the screen afterwards.


## type.unseen_not_focused
The element list has no field, so the text was pasted, but nothing on the screen changed and no keyboard was up: the input box probably does not hold focus. Tap the input box first (a visibleText center or a found point), then type again without a ref. Do not just repeat the paste.


## type.point_not_typed
The point was tapped and the text pasted, but nothing on the screen changed: that point is probably not an input box, or it did not get focus. Nothing was typed. Find the input box again (observe, or phone_find_visually) and type at its point; do not repeat the same point.


## type.point_switched
Tapping that point opened {{pkg}} instead of focusing an input box, so nothing was typed. Go back and find the input box again.


## clear.point_not_cleared
The point was tapped and select-all and delete were sent, but nothing on the screen changed: that point is probably not an input box (or the box was already empty). Find the input box again before clearing.


## clear.unseen_cleared
The element list has no field here, so the focused box was cleared with select-all and delete; observe to check it is empty.


## clear.unseen_not_focused
The element list has no field, so select-all and delete were sent, but nothing on the screen changed and no keyboard was up: the input box probably does not hold focus (or it was already empty). Tap the input box first, then clear again.

