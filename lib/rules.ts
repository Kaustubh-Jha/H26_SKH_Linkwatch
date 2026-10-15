import type {
  MigrationStep,
  Outcome,
  PythonVersion,
  InstallSource,
  Replacement,
  RiskIndicator,
  Severity,
} from './types'

export interface SimContext {
  python: PythonVersion
  installFrom: InstallSource
  timeout: number | null
  applied: boolean
}

/** target: a test function name, `file:<path>` for every test in a file, or `check:<id>` */
export interface Impact {
  target: string
  outcome: Outcome
  reason: string
}

export interface UsagePattern {
  re: RegExp
  kind: 'import' | 'call'
}

export interface Rule {
  id: string
  packages: string[]
  displayName: string
  severity: Severity
  baseScore: number
  summary: string
  patterns: UsagePattern[]
  buildPatterns?: RegExp[]
  flagIfUnused?: boolean
  onlyIfUndeclared?: boolean
  indicators: RiskIndicator[]
  replacement: Replacement
  steps: MigrationStep[]
  gaps: string[]
  limitations: string[]
  impact?: (ctx: SimContext) => Impact[]
}

const importOf = (mod: string): UsagePattern => ({
  re: new RegExp(`^\\s*(import\\s+${mod}\\b|from\\s+${mod}(\\.[\\w.]+)?\\s+import\\b)`),
  kind: 'import',
})

const callOf = (pattern: string): UsagePattern => ({ re: new RegExp(pattern), kind: 'call' })

export const RULES: Rule[] = [
  {
    id: 'jinja2',
    packages: ['jinja2'],
    displayName: 'Jinja2',
    severity: 'critical',
    baseScore: 90,
    summary:
      'End-of-life 2.x template engine that fails to import on a fresh install because MarkupSafe is unpinned.',
    patterns: [
      importOf('jinja2'),
      callOf('\\b(Environment|FileSystemLoader|PackageLoader|select_autoescape)\\('),
      callOf('\\.get_template\\(|\\.render\\('),
    ],
    indicators: [
      {
        kind: 'eol',
        label: 'Jinja2 2.x is end-of-life',
        detail:
          'The 2.11 line stopped receiving fixes in 2021. Every security patch since (sandbox escapes, xmlattr XSS) has shipped only on 3.1.x.',
      },
      {
        kind: 'runtime',
        label: 'Breaks on fresh installs',
        detail:
          'Jinja2 2.11.3 imports markupsafe.soft_unicode, which MarkupSafe 2.1 removed. MarkupSafe is unpinned, so pip resolves 3.x and `import jinja2` raises ImportError — `linkwatch report` cannot run.',
      },
    ],
    replacement: {
      name: 'Jinja2',
      version: '>=3.1.6,<4',
      kind: 'upgrade',
      effort: 'trivial',
      rationale:
        'Environment, FileSystemLoader and select_autoescape keep identical signatures in 3.x, so the upgrade is a pin change. 3.1.6 carries all published sandbox and attribute-escaping fixes.',
      alternatives: [
        {
          name: 'string.Template',
          note: 'Not viable: status.html.j2 relies on loops and conditionals.',
        },
        {
          name: 'Chameleon / Mako',
          note: 'Full template rewrite with no benefit over a supported Jinja2.',
        },
      ],
    },
    steps: [
      {
        title: 'Raise the Jinja2 pin and pin MarkupSafe explicitly',
        file: 'requirements.txt',
        detail: 'Apply the same constraint in pyproject.toml [project].dependencies.',
        before: 'Jinja2==2.11.3',
        after: 'Jinja2>=3.1.6,<4\nMarkupSafe>=2.1,<4',
      },
      {
        title: 'Audit the template for removed 2.x features',
        file: 'linkwatch/templates/status.html.j2',
        detail:
          'Remove any `{% extends %}` of jinja2.ext.autoescape / with_ extensions (built-in since 3.0) and rename contextfilter decorators to pass_context if they are ever added.',
      },
      {
        title: 'Verify the report path end-to-end',
        file: 'tests/test_report.py',
        detail: 'Run test_report_renders_all_sites; it is the only test that imports linkwatch.report.',
      },
    ],
    gaps: [
      'jinja2.Markup and jinja2.escape re-exports are gone in 3.x — import from markupsafe if they are ever used.',
      'Autoescape is enabled via select_autoescape(["html", "j2"]); behaviour is unchanged, but any `|safe` usage in status.html.j2 should be re-reviewed.',
    ],
    limitations: [
      'The Jinja template itself was not rendered by this analyzer; only Python call sites were inspected.',
    ],
    impact: (ctx) =>
      ctx.applied
        ? [{ target: 'test_report_renders_all_sites', outcome: 'pass', reason: 'Jinja2 3.1.x imports cleanly with MarkupSafe 3.x' }]
        : [
            {
              target: 'test_report_renders_all_sites',
              outcome: 'fail',
              reason: "ImportError: cannot import name 'soft_unicode' from 'markupsafe'",
            },
            {
              target: 'check:install',
              outcome: 'warn',
              reason: 'Resolver installs MarkupSafe 3.x next to Jinja2 2.11.3 without flagging the incompatibility',
            },
          ],
  },
  {
    id: 'pydantic',
    packages: ['pydantic'],
    displayName: 'pydantic',
    severity: 'high',
    baseScore: 80,
    summary:
      'Two manifests resolve different major versions, and config.py is written against the deprecated v1 API.',
    patterns: [
      importOf('pydantic'),
      callOf('@validator\\('),
      callOf('^\\s*class Config:'),
      callOf('anystr_strip_whitespace|extra\\s*=\\s*"forbid"'),
    ],
    indicators: [
      {
        kind: 'deprecated',
        label: 'Written against the v1 API',
        detail:
          'config.py uses @validator, inner `class Config` and anystr_strip_whitespace. All are deprecated in v2 and scheduled for removal in v3.',
      },
      {
        kind: 'eol',
        label: 'pydantic 1.x is maintenance-only',
        detail: 'The 1.10 branch receives only critical fixes and lacks Python 3.13 support before 1.10.17.',
      },
    ],
    replacement: {
      name: 'pydantic',
      version: '>=2.7,<3',
      kind: 'upgrade',
      effort: 'low',
      rationale:
        'Standardise both manifests on v2 and port the two validators and two Config classes to field_validator / ConfigDict.',
      alternatives: [
        {
          name: 'pydantic.v1 compatibility shim',
          note: '`from pydantic.v1 import BaseModel, validator` keeps v1 semantics on v2 — a temporary bridge only.',
        },
        {
          name: 'dataclasses + manual validation',
          note: 'Removes the dependency; viable because only two small models exist.',
        },
      ],
    },
    steps: [
      {
        title: 'Align the version constraint across manifests',
        file: 'requirements.txt',
        detail: 'pyproject.toml already declares pydantic>=2; make requirements.txt agree so Docker and `make setup` match `pip install .`.',
        before: 'pydantic==1.10.13',
        after: 'pydantic>=2.7,<3',
      },
      {
        title: 'Port validators to field_validator',
        file: 'linkwatch/config.py',
        detail: 'field_validator must be stacked above @classmethod.',
        before: 'from pydantic import BaseModel, validator\n\n    @validator("url")\n    def url_has_scheme(cls, value):',
        after:
          'from pydantic import BaseModel, ConfigDict, field_validator\n\n    @field_validator("url")\n    @classmethod\n    def url_has_scheme(cls, value):',
      },
      {
        title: 'Replace inner Config classes with model_config',
        file: 'linkwatch/config.py',
        detail: 'anystr_strip_whitespace was renamed to str_strip_whitespace.',
        before: '    class Config:\n        anystr_strip_whitespace = True\n\n    class Config:\n        extra = "forbid"',
        after: '    model_config = ConfigDict(str_strip_whitespace=True)\n\n    model_config = ConfigDict(extra="forbid")',
      },
    ],
    gaps: [
      'Validation error text changes (e.g. "Value error, url must start with…"), so any tooling that parses CLI errors will break.',
      'Unknown keys in sites.toml raise `extra_forbidden` instead of `extra fields not permitted`.',
    ],
    limitations: [
      'No test asserts validation failures (empty name, missing scheme), so validator parity is unverified.',
    ],
    impact: (ctx) => {
      if (ctx.applied) {
        return [
          { target: 'test_sites_file_loads', outcome: 'pass', reason: 'Settings parses under pydantic v2 without deprecation warnings' },
        ]
      }
      const impacts: Impact[] = [
        {
          target: 'check:install',
          outcome: 'warn',
          reason: 'requirements.txt resolves pydantic 1.10.13 but pyproject.toml resolves 2.x',
        },
      ]
      if (ctx.installFrom === 'pyproject') {
        impacts.push({
          target: 'file:tests/test_config.py',
          outcome: 'warn',
          reason: 'PydanticDeprecatedSince20: @validator and class-based Config are deprecated',
        })
      } else if (ctx.python === '3.13') {
        for (const file of ['tests/test_config.py', 'tests/test_checker.py']) {
          impacts.push({
            target: `file:${file}`,
            outcome: 'fail',
            reason: "pydantic 1.10.13 on 3.13: TypeError in ForwardRef._evaluate() ('recursive_guard')",
          })
        }
      }
      return impacts
    },
  },
  {
    id: 'requests',
    packages: ['requests'],
    displayName: 'requests',
    severity: 'high',
    baseScore: 74,
    summary:
      'Pinned below security fixes, coupled to a private helper, globally monkeypatched and called without a timeout.',
    patterns: [
      importOf('requests'),
      callOf('_parse_content_type_header'),
      callOf('requests\\.Session\\.request|_original_request'),
      callOf('session\\.get\\(|\\bS\\(\\)'),
      callOf('requests\\.exceptions\\.\\w+'),
    ],
    indicators: [
      {
        kind: 'private-api',
        label: 'Private helper imported',
        detail:
          'encoding.py imports requests.utils._parse_content_type_header — an underscore-prefixed internal with no stability guarantee across releases.',
      },
      {
        kind: 'private-api',
        label: 'Global monkeypatch of Session.request',
        detail:
          'http_patch.py replaces requests.Session.request at import time to force a User-Agent, silently affecting every requests caller in the process.',
      },
      {
        kind: 'runtime',
        label: 'No request timeout',
        detail:
          'session.get() is called without timeout=, so the `except requests.exceptions.Timeout` branch in checker.py is unreachable and one stalled host blocks the whole run.',
      },
    ],
    replacement: {
      name: 'requests',
      version: '>=2.32.4,<3',
      kind: 'upgrade',
      effort: 'low',
      rationale:
        'A minor upgrade closes the published advisories. Replacing the private helper and the monkeypatch with public APIs keeps future upgrades safe.',
      alternatives: [
        { name: 'httpx', note: 'Timeouts on by default and async-ready, but a larger diff (exceptions, Response API).' },
        { name: 'urllib3 2.x directly', note: 'Lower level; redirects and sessions would need reimplementation.' },
      ],
    },
    steps: [
      {
        title: 'Raise the requests pin',
        file: 'requirements.txt',
        detail: 'Apply in pyproject.toml as well.',
        before: 'requests==2.31.0',
        after: 'requests>=2.32.4,<3',
      },
      {
        title: 'Replace the private content-type parser',
        file: 'linkwatch/encoding.py',
        detail: 'email.message.Message parses Content-Type parameters with a public, stdlib API.',
        before:
          'from requests.utils import _parse_content_type_header\n\n    _, params = _parse_content_type_header(resp.headers.get("Content-Type", ""))\n    charset = params.get("charset")',
        after:
          'from email.message import Message\n\n    msg = Message()\n    msg["Content-Type"] = resp.headers.get("Content-Type", "")\n    charset = msg.get_param("charset")',
      },
      {
        title: 'Set the User-Agent per session instead of monkeypatching',
        file: 'linkwatch/checker.py',
        detail: 'Then delete http_patch.py and its import in cli.py.',
        before: '    session = S()',
        after: '    session = requests.Session()\n    session.headers["User-Agent"] = USER_AGENT',
      },
      {
        title: 'Add an explicit timeout',
        file: 'linkwatch/checker.py',
        detail: 'Makes the existing Timeout handler reachable. Choose a value above the slowest legitimate site.',
        before: '        return session.get(url, verify=certifi.where())',
        after: '        return session.get(url, verify=certifi.where(), timeout=TIMEOUT)',
      },
    ],
    gaps: [
      'A timeout changes behaviour for slow hosts: the /slow fixture sleeps 6 s, so any timeout below 6 s flips test_slow_is_up from UP to DOWN.',
      'Removing the global monkeypatch means other code using requests in the same process no longer sends linkwatch/1.0.',
    ],
    limitations: [
      'Advisory exposure was assessed from the pinned version only; whether each advisory is reachable in linkwatch (e.g. verify=False reuse) was not proven.',
    ],
    impact: (ctx) => {
      if (!ctx.applied) return []
      const impacts: Impact[] = [
        { target: 'test_user_agent', outcome: 'pass', reason: 'User-Agent is set through session.headers' },
      ]
      if (ctx.timeout === null) {
        impacts.push({
          target: 'test_slow_is_up',
          outcome: 'warn',
          reason: 'No timeout configured — Timeout handler remains unreachable',
        })
      } else if (ctx.timeout < 6) {
        impacts.push({
          target: 'test_slow_is_up',
          outcome: 'fail',
          reason: `ReadTimeout after ${ctx.timeout}s; /slow responds in 6s so the site is reported DOWN`,
        })
      } else if (ctx.timeout < 8) {
        impacts.push({
          target: 'test_slow_is_up',
          outcome: 'warn',
          reason: `Passes with under 2s margin at timeout=${ctx.timeout}s — likely flaky on loaded CI`,
        })
      } else {
        impacts.push({ target: 'test_slow_is_up', outcome: 'pass', reason: `timeout=${ctx.timeout}s leaves headroom over the 6s fixture` })
      }
      return impacts
    },
  },
  {
    id: 'setuptools',
    packages: ['setuptools'],
    displayName: 'setuptools / pkg_resources',
    severity: 'high',
    baseScore: 72,
    summary:
      'Runtime code depends on the deprecated pkg_resources module, forcing a pinned build tool into production installs.',
    patterns: [importOf('pkg_resources'), callOf('pkg_resources\\.\\w+')],
    indicators: [
      {
        kind: 'deprecated',
        label: 'pkg_resources is deprecated',
        detail:
          'Importing pkg_resources emits a DeprecationWarning and the module is scheduled for removal from setuptools; it is also slow to import because it scans every installed distribution.',
      },
      {
        kind: 'runtime',
        label: 'Build tool pinned as a runtime dependency',
        detail:
          'setuptools==75.8.0 is listed in requirements.txt and [project].dependencies only to keep pkg_resources importable, blocking security updates to the build backend.',
      },
    ],
    replacement: {
      name: 'importlib.resources',
      version: 'stdlib (Python 3.9+)',
      kind: 'stdlib',
      effort: 'low',
      rationale:
        'importlib.resources.files() is the supported way to locate package data. Jinja2 can also load templates straight from the package with PackageLoader.',
      alternatives: [
        { name: 'jinja2.PackageLoader', note: 'Let Jinja resolve templates inside the package; removes the filesystem path entirely.' },
        { name: 'importlib_resources', note: 'Backport only needed below 3.9 — not required (requires-python >= 3.10).' },
      ],
    },
    steps: [
      {
        title: 'Locate templates with importlib.resources',
        file: 'linkwatch/resources.py',
        detail: 'files() returns a Traversable rooted at the installed package.',
        before: 'import pkg_resources\n\ndef template_dir():\n    return pkg_resources.resource_filename("linkwatch", "templates")',
        after: 'from importlib.resources import files\n\ndef template_dir():\n    return str(files("linkwatch") / "templates")',
      },
      {
        title: 'Optionally switch report.py to PackageLoader',
        file: 'linkwatch/report.py',
        detail: 'Works for zipped installs as well as regular site-packages installs.',
        before: '        loader=FileSystemLoader(template_dir()),',
        after: '        loader=PackageLoader("linkwatch", "templates"),',
      },
      {
        title: 'Drop setuptools from runtime dependencies',
        file: 'requirements.txt',
        detail: 'Keep it only in [build-system].requires in pyproject.toml.',
        before: 'setuptools==75.8.0',
        after: '# setuptools removed: build-time only',
      },
    ],
    gaps: [
      'str(files(...)) only yields a real directory for regular installs; zipapp / zipimport installs need importlib.resources.as_file() or PackageLoader.',
      '`linkwatch info` prints the template path; with PackageLoader it becomes informational only.',
    ],
    limitations: [
      'No test covers `linkwatch info` or zipped installs; template lookup is exercised only indirectly via test_report_renders_all_sites.',
    ],
    impact: (ctx) =>
      ctx.applied
        ? []
        : [
            {
              target: 'test_report_renders_all_sites',
              outcome: 'warn',
              reason: 'DeprecationWarning: pkg_resources is deprecated as an API',
            },
          ],
  },
  {
    id: 'nose',
    packages: ['nose'],
    displayName: 'nose',
    severity: 'high',
    baseScore: 70,
    summary: 'Abandoned test runner that cannot start on any Python version this project supports.',
    patterns: [importOf('nose')],
    buildPatterns: [/\bnosetests\b/, /\bnose\b/],
    indicators: [
      {
        kind: 'eol',
        label: 'Abandoned since 2015',
        detail: 'nose 1.3.7 is the final release; the project directs users to pytest or nose2.',
      },
      {
        kind: 'runtime',
        label: 'Incompatible with Python 3.10+',
        detail:
          'nose relies on collections.Callable (removed in 3.10) and the imp module (removed in 3.12). `make test-nose` fails on the project\u2019s own python:3.12-slim image.',
      },
    ],
    replacement: {
      name: 'pytest',
      version: 'already installed',
      kind: 'remove',
      effort: 'trivial',
      rationale: 'The suite is already pytest-native (session fixtures in conftest.py). nose contributes nothing.',
      alternatives: [{ name: 'pynose', note: 'Community fork, only if a nose-style runner is a hard requirement.' }],
    },
    steps: [
      {
        title: 'Remove nose from dev requirements',
        file: 'requirements-dev.txt',
        detail: 'pytest remains the sole runner.',
        before: 'pytest\nnose==1.3.7',
        after: 'pytest',
      },
      {
        title: 'Delete the test-nose make target',
        file: 'Makefile',
        detail: 'Also remove it from the .PHONY list.',
        before: '.PHONY: setup test test-nose docker-build docker-test\n\ntest-nose:\n\tnosetests tests/',
        after: '.PHONY: setup test docker-build docker-test',
      },
    ],
    gaps: ['Any CI job or contributor script invoking `make test-nose` must be updated.'],
    limitations: [
      'pytest fixtures (server, closed_port) were never resolvable under nose, so historic nose runs were already partial.',
    ],
    impact: (ctx) =>
      ctx.applied
        ? [{ target: 'check:nose', outcome: 'skip', reason: 'Target removed — pytest is the only runner' }]
        : [
            {
              target: 'check:nose',
              outcome: 'fail',
              reason:
                ctx.python === '3.10' || ctx.python === '3.11'
                  ? "AttributeError: module 'collections' has no attribute 'Callable'"
                  : "ModuleNotFoundError: No module named 'imp'",
            },
          ],
  },
  {
    id: 'appdirs',
    packages: ['appdirs'],
    displayName: 'appdirs',
    severity: 'medium',
    baseScore: 58,
    summary: 'Unmaintained platform-path helper used for the results cache location.',
    patterns: [importOf('appdirs'), callOf('\\buser_(cache|data|config|log)_dir\\(')],
    indicators: [
      {
        kind: 'unmaintained',
        label: 'No longer maintained',
        detail: 'appdirs has had no release since 1.4.4 (May 2020). Its maintainers point users to the platformdirs fork.',
      },
    ],
    replacement: {
      name: 'platformdirs',
      version: '>=4.2,<5',
      kind: 'package',
      effort: 'trivial',
      rationale: 'Actively maintained fork of appdirs with the same function names and a typed API.',
      alternatives: [{ name: 'Manual XDG/LOCALAPPDATA logic', note: 'Fewer deps, but re-implements edge cases platformdirs already handles.' }],
    },
    steps: [
      {
        title: 'Swap the dependency',
        file: 'requirements.txt',
        detail: 'Apply in pyproject.toml as well.',
        before: 'appdirs==1.4.4',
        after: 'platformdirs>=4.2,<5',
      },
      {
        title: 'Update the import and preserve the Windows path',
        file: 'linkwatch/cache.py',
        detail:
          'appdirs defaults appauthor to appname on Windows; platformdirs does not. Without appauthor the cache moves from %LOCALAPPDATA%\\linkwatch\\linkwatch\\Cache to %LOCALAPPDATA%\\linkwatch\\Cache and earlier results vanish.',
        before: 'from appdirs import user_cache_dir\n\n    ... or user_cache_dir("linkwatch")',
        after: 'from platformdirs import user_cache_dir\n\n    ... or user_cache_dir("linkwatch", appauthor="linkwatch")',
      },
    ],
    gaps: [
      'Windows cache path changes unless appauthor is passed explicitly — the README documents the old path.',
      'macOS (~/Library/Caches/linkwatch) and Linux (~/.cache/linkwatch) paths are unchanged.',
    ],
    limitations: [
      'test_cache_round_trip sets LINKWATCH_CACHE_DIR, so the platform default path is never exercised by tests.',
    ],
    impact: (ctx) =>
      ctx.applied
        ? [
            {
              target: 'test_cache_round_trip',
              outcome: 'pass',
              reason: 'Unaffected — LINKWATCH_CACHE_DIR override bypasses platformdirs',
            },
          ]
        : [],
  },
  {
    id: 'toml',
    packages: ['toml'],
    displayName: 'toml',
    severity: 'medium',
    baseScore: 55,
    summary: 'Unmaintained TOML parser that predates TOML 1.0; the stdlib now ships tomllib.',
    patterns: [importOf('toml'), callOf('\\btoml\\.loads?\\(')],
    indicators: [
      {
        kind: 'unmaintained',
        label: 'Implements an outdated TOML spec',
        detail: 'toml 0.10.2 (2020) targets TOML 0.5 and is not compliant with TOML 1.0; it is no longer actively developed.',
      },
    ],
    replacement: {
      name: 'tomllib',
      version: 'stdlib (3.11+) · tomli backport for 3.10',
      kind: 'stdlib',
      effort: 'low',
      rationale: 'tomllib is the standard-library TOML 1.0 reader; tomli is the identical backport for Python 3.10.',
      alternatives: [{ name: 'tomlkit', note: 'Style-preserving read/write; only needed if linkwatch ever writes sites.toml.' }],
    },
    steps: [
      {
        title: 'Load TOML via tomllib with a 3.10 fallback',
        file: 'linkwatch/config.py',
        detail: 'tomllib requires a binary file handle.',
        before: 'import toml\n\n    data = toml.load(path)',
        after:
          'try:\n    import tomllib\nexcept ModuleNotFoundError:  # Python 3.10\n    import tomli as tomllib\n\n    with open(path, "rb") as fh:\n        data = tomllib.load(fh)',
      },
      {
        title: 'Replace the dependency with a conditional backport',
        file: 'requirements.txt',
        detail: 'requires-python is >=3.10, so the backport is mandatory there.',
        before: 'toml==0.10.2',
        after: 'tomli>=2; python_version < "3.11"',
      },
    ],
    gaps: [
      'tomllib only accepts binary file handles — passing a path string raises TypeError.',
      'Parse errors change from toml.TomlDecodeError to tomllib.TOMLDecodeError.',
    ],
    limitations: ['No test covers malformed sites.toml handling.'],
    impact: (ctx) =>
      ctx.applied && ctx.python === '3.10'
        ? [
            {
              target: 'test_sites_file_loads',
              outcome: 'warn',
              reason: 'Relies on the tomli backport marker resolving on Python 3.10',
            },
          ]
        : [],
  },
  {
    id: 'idna',
    packages: ['idna'],
    displayName: 'idna',
    severity: 'medium',
    baseScore: 50,
    summary: 'Hard pin on a 2018 transitive dependency that linkwatch never imports.',
    patterns: [importOf('idna')],
    indicators: [
      {
        kind: 'runtime',
        label: 'Unnecessary transitive pin',
        detail:
          'idna is only used by requests for hostname encoding. Pinning 2.7 overrides the patched 3.x line requests would otherwise resolve.',
      },
    ],
    replacement: {
      name: 'idna',
      version: 'remove pin (resolves 3.x)',
      kind: 'remove',
      effort: 'trivial',
      rationale: 'Let requests pull a maintained, patched idna release.',
    },
    steps: [
      {
        title: 'Remove the explicit pin',
        file: 'requirements.txt',
        detail: 'Remove from pyproject.toml as well.',
        before: 'idna==2.7',
        after: '',
      },
    ],
    gaps: [
      'idna 3.x encodes some internationalised domains differently (UTS #46 handling) — relevant only if sites.toml lists IDN hosts.',
    ],
    limitations: ['sites.toml contains ASCII hostnames only; IDN behaviour is untested.'],
  },
  {
    id: 'chardet',
    packages: ['chardet'],
    displayName: 'chardet',
    severity: 'medium',
    baseScore: 42,
    summary: 'LGPL encoding detector duplicating what requests already provides via charset-normalizer.',
    patterns: [importOf('chardet'), callOf('chardet\\.detect\\(')],
    indicators: [
      {
        kind: 'license',
        label: 'LGPL in an MIT project',
        detail: 'chardet is LGPL-2.1; requests already ships the MIT-licensed charset-normalizer for the same purpose.',
      },
    ],
    replacement: {
      name: 'charset-normalizer',
      version: '>=3.3,<4',
      kind: 'package',
      effort: 'low',
      rationale: 'Already installed through requests; drop-in detection with a permissive license.',
      alternatives: [{ name: 'resp.apparent_encoding', note: 'Public requests API backed by charset-normalizer — zero new imports.' }],
    },
    steps: [
      {
        title: 'Switch the detector',
        file: 'linkwatch/encoding.py',
        detail: 'from_bytes().best() returns None when nothing matches.',
        before: 'import chardet\n\n    guess = chardet.detect(resp.content)\n    return guess["encoding"] or "utf-8"',
        after:
          'from charset_normalizer import from_bytes\n\n    best = from_bytes(resp.content).best()\n    return best.encoding if best else "utf-8"',
      },
    ],
    gaps: [
      'Short single-byte pages may be labelled cp1250 / latin-1 instead of Windows-1252. "Café Crème" decodes identically, but glyphs like € and curly quotes can diverge.',
    ],
    limitations: ['Only one non-UTF-8 fixture (cp1252) exists in conftest.py.'],
    impact: (ctx) =>
      ctx.applied
        ? [
            {
              target: 'test_latin1_title',
              outcome: 'warn',
              reason: 'Detector change — fixture decodes correctly, but encoding label may differ on real pages',
            },
          ]
        : [],
  },
  {
    id: 'six',
    packages: ['six'],
    displayName: 'six',
    severity: 'low',
    baseScore: 28,
    summary: 'Python 2 compatibility shim declared but never imported.',
    patterns: [importOf('six')],
    flagIfUnused: true,
    indicators: [
      {
        kind: 'deprecated',
        label: 'Python 2 compatibility layer',
        detail: 'requires-python is >=3.10; six serves no purpose on Python 3-only code.',
      },
    ],
    replacement: {
      name: 'six',
      version: 'remove',
      kind: 'remove',
      effort: 'trivial',
      rationale: 'No import sites exist, so removal is a manifest-only change.',
    },
    steps: [
      {
        title: 'Remove from both manifests',
        file: 'requirements.txt',
        detail: 'Also delete "six" from pyproject.toml [project].dependencies.',
        before: 'six',
        after: '',
      },
    ],
    gaps: [],
    limitations: ['Dynamic imports (importlib.import_module("six")) are not detected by static scanning.'],
  },
  {
    id: 'certifi',
    packages: ['certifi'],
    displayName: 'certifi',
    severity: 'low',
    baseScore: 32,
    summary: 'Imported directly but only installed transitively through requests.',
    patterns: [importOf('certifi'), callOf('certifi\\.where\\(\\)')],
    onlyIfUndeclared: true,
    indicators: [],
    replacement: {
      name: 'certifi',
      version: '>=2024.7.4',
      kind: 'declare',
      effort: 'trivial',
      rationale: 'Declare it explicitly — or drop verify= entirely, since requests already defaults to the certifi bundle.',
    },
    steps: [
      {
        title: 'Declare certifi explicitly',
        file: 'requirements.txt',
        detail: 'Apply in pyproject.toml as well.',
        before: '',
        after: 'certifi>=2024.7.4',
      },
      {
        title: 'Or rely on the requests default',
        file: 'linkwatch/checker.py',
        detail: 'Removes the direct import; REQUESTS_CA_BUNDLE then becomes honoured.',
        before: '        return session.get(url, verify=certifi.where())',
        after: '        return session.get(url)',
      },
    ],
    gaps: ['Dropping verify= makes REQUESTS_CA_BUNDLE effective — a behaviour change for corporate proxies.'],
    limitations: [],
  },
]

export const RULES_BY_ID = new Map(RULES.map((r) => [r.id, r]))

export function normalizePackage(name: string) {
  return name.toLowerCase().replace(/[-_.]+/g, '-')
}

export const RULES_BY_PACKAGE = new Map(
  RULES.flatMap((r) => r.packages.map((p) => [normalizePackage(p), r] as const)),
)
