# `/giphy` (`/gif`)

Sends a GIPHY GIF as a looping video: random by tag or a specific one by URL or ID. With no argument
it uses the `gif.tag` setting. It needs a GIPHY key: `GIPHY_API_KEY` in `config/.env` or, if it
doesn't exist, the `giphy.api.key` setting (`/set giphy.api.key <key>`).

```text
/giphy          → default tag (setting gif.tag)
/giphy gatos    → GIF with the tag "gatos"
/gif gatos      → the same, through the alias
/giphy https://giphy.com/gifs/h5WUvmDSB0njFcFeCE
/giphy h5WUvmDSB0njFcFeCE  → the same GIF by ID
```

Accepted URLs use `giphy.com/gifs/<ID>` or `giphy.com/gifs/<name>-<ID>`. An alphanumeric argument
with at least ten characters is interpreted as an ID; the others are tags. The video is downloaded
as MP4, with a 10 MB limit. With no result, the bot warns in the chat.
