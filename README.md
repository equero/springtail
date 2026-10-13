# springtail

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Follow the log of a Maven / Spring Boot backend live in the browser, with filters that make a noisy
startup readable.

You keep starting your backend the way you always do. springtail only reads what it prints: either
the log file the app writes, or the console output you pipe into it. Nothing to add to the project.

The name: a springtail is a tiny bug that lives in the leaf litter. This one lives in your Spring logs
and tails them.

## Install

Requires Node 22 or newer.

```bash
git clone https://github.com/hbeneke/springtail.git
cd springtail
npm install    # builds into dist/
npm link       # puts the `springtail` command on your PATH
```

`npm link` creates the command for PowerShell, cmd, Bash and zsh alike, plus `stail` as a short alias.
To remove it: `npm unlink -g springtail`.

## Usage

There are two ways to feed the viewer.

**The app writes a log file.** Start the backend in one terminal, then in another one, from the
project folder:

```bash
springtail watch                  # newest .log in ., logs/, log/ or target/
springtail watch logs/app.log     # or a file
springtail watch --name api       # with a different name in the viewer
```

If your Spring Boot app only logs to the console, add `logging.file.name=logs/app.log` to its
`application.properties`.

**The app only prints to the console.** Pipe it in:

```bash
mvn spring-boot:run 2>&1 | springtail capture --open
```

The output still shows up in the terminal. Each capture starts a fresh log.

> On Windows PowerShell 5.1 the pipe turns non-ASCII characters into `?`. PowerShell 7, cmd and
> Bash keep them.

Everything else:

| Command | What it does |
|---|---|
| `springtail open [name]` | Open the viewer, on a given log if you pass one |
| `springtail list` | Show the logs the viewer knows about |
| `springtail unwatch <name>` | Stop following a watched file |
| `springtail stop` | Stop the viewer |

The viewer runs in the background on <http://localhost:8090> and only listens on `127.0.0.1`.
Captured logs and settings live in `~/.springtail/`.

| Variable | Default | |
|---|---|---|
| `SPRINGTAIL_HOME` | `~/.springtail` | Where captured logs and the watch list are kept |
| `SPRINGTAIL_PORT` | `8090` | Viewer port |

## The viewer

- Understands the standard Spring Boot layout, `date LEVEL pid --- [app] [thread] logger : message`,
  and the multi-line variant with the logger on its own line.
- Stack traces stay inside their entry. `Hibernate:` SQL shows up as its own `SQL` level, Maven lines
  keep their level, anything else is `OUT`.
- Large files are read from their last 2 MB. When the file is truncated (a new run) the view starts over.

| Control | |
|---|---|
| Search | Message, logger, thread and context. `Aa` for case, `.*` for regex. Shortcut `/` |
| Loggers | Comma separated. `com.acme` keeps, `-org.hibernate` drops |
| Levels | Click to toggle, double click to keep only that one |
| Click a logger | Adds it to the filter, `Alt`+click excludes it |
| Click a row | Shows the whole message and its metadata |
| Pause (`p`) | Freezes the view while new lines pile up |
| Follow (`End`) | Sticks to the bottom; scrolling up turns it off |
| Clear | Hides everything received so far |

It keeps the last 20,000 entries per log and draws at most the last 3,000 that pass the filters.

## Development

```bash
npm run build     # compile src/ into dist/
npm run lint      # Biome
npm run viewer    # run the viewer in the foreground
```

```
src/
  cli/       the `springtail` command
  server/    log tailing, parsing and the HTTP / SSE server
  web/       the page's scripts
  shared/    types and settings used by more than one side
public/      HTML, CSS and favicon
```

Work happens on `develop`; `master` holds releases. Releases are done with
[synkro](https://github.com/equero/synkro), always as a patch bump:

```bash
synkro status                   # what the next release would contain
synkro sync --patch             # merge develop into master, bump patch, tag, push
synkro sync --patch --dry-run   # show what would happen, change nothing
```

Each release is a single merge commit on `master` that also carries the new version, tagged
`vX.Y.Z` with a changelog. `develop` is fast-forwarded to it afterwards.

## License

[GPL-3.0](LICENSE)
