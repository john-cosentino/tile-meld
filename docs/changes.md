# Changes to tile-meld immediately after the addition to 1 player vs CPU
# 2026-07-20

##Layout

---
Public Lobby | Create Room | Join by Code | Recovery
---

Tile Meld (larger Font)

---

Create a Game:

Play vs Computer | Create a Room | Join By Code | Browse Public

---

Your Games:

---

### Naming
- Public rooms created by a user should be named `public_username` (Where username is the username of the room's creator)
    - public rooms should allow anyone to join
    - if a users has more than one public room open, append a number to `public_username`(example `public_John 1`)
- Private Rooms should simply be the name of the user that created them
    - append a number to the end of the name for multiple rooms (example John 1, John 2)
- Because of this a unique username should be required.

### Main screen changes

- Room names/codes should be named the same as the user that creates them
    - if a user has more than one room open, append a number to their name (example John 1, John 2, John 3)
- Completed games should look different than active games.
    - Open games but not in play are white
    - Games in play are green
    - completed/ended/resigned games are grey
- Completed/ended/resigned games last 4 hours and then are permanently deleted
- When the second person enters the room the game should start.
    - I find the ready and "start game" functions to be extraneous.  disable them, but dont delete the functionality.
- Replace "create a room" with "New Game"
- Replace "Join room by Code" with "Join Room by Name"
- Replace Browse Public with "Browse Public Lobby"

### Game screen changes
- Remove extraneous information from this page
- Look the the Library for tile meld artwork
    - use the layout found in the artwork.  Not an upgrade to the current graphics, but  would like you to use this layout.
