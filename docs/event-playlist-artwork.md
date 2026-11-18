# Playlist artwork in event add-song sheet

Cause: the Playlists tab in renderEventAddSongs built a legacy initials tile and ignored coverImage and song artwork.

Correction: homePlaylists.artworkForPlaylist wraps the existing artwork renderer with the playlist's personalized cover and resolved songs. The event sheet uses it directly, preserving custom image, song mosaic and shared double-stem playlist-note fallback. Other row text, controls, permissions and add-to-event behavior remain unchanged.

Validation: event-playlist-artwork-ui uses synthetic custom cover, song-cover mosaic and missing-art playlist. Checks the approved double-stem viewBox, no initials, containment at 320/390/820px and successful addition to a test event. user-playlists and index-syntax also pass. No real accounts or events changed by tests.
