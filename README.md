# SiteCompanion
SiteCompanion is a browser extension that allows you to run AI
pipelines on the visible text of any site.

> SiteCompanion saves you from copying and pasting to run AI on sites.

## Setup
1. Download the code (will be published to the Chrome Store soon) and
   load the extension code (`sitecompanion/`) as an unpacked
   extension.
2. Configure your API keys, API endpoints, environments, profiles, and
   tasks.
3. Go to a site.
4. Choose to either paste in part of the site for structured matching
   or use the full text of the site.
5. Start running your tasks!

## Execution
How `SiteCompanion` works.

See [Configurations and Terms](#configurations-and-terms) for details
on specific terms.

### Model
The execution of `SiteCompanion` strictly follows this model:

```
Extract Site Text -> Build Prompt -> Run (Send Request) -> Receive Output -> Stop
```

### Prompt Building
The prompt will always be built in the following order:

```
System prompt -> Profile -> Task prompt -> Extracted Site Text
```

### Extension Popup
This is the control panel for `SiteCompanion` on sites.

The following sections describe the modes of the extension popup.

#### Configuration - Pasting Mode
This is the mode the popup UI is in when on an unknown site.

You can choose to try extracting the minimal enclosing class that
contains the pasted text or the full text of the body of the current
site. Choosing either will proceed to [Confirmation
Mode](#configuration-confirmation-mode).

#### Configuration - Confirmation Mode
This is the mode to review the extracted text based on your current
site's contents and confirm the configuration of the current site
including the name, URL match pattern and the workspace it belongs to.

Confirming will add the current site to the list of known sites and
enter [Normal Mode](#normal-mode).

See [Site-Specific Configurations](#site-specific-configurations) for
configuration details.

#### Normal Mode
This is the mode where most of the actions happen.

The knobs for running a task:
- Environment: the environment in which the task is running.
- Profile: the user profile used by the task.
- Task: the task to run.
- "Custom" button: enters [Custom Mode](#custom-mode).
- "Run" button: run the task with the current environment and profile.

And a few buttons for the output buffer:
- "Copy" button: copies the contents of the output buffer in text.
- "Copy Markdown" button: copies the contents of the output buffer
  with Markdown formatting.
- "Clear" button: clears the contents of the output buffer.

#### Custom Mode
This is a variant of [Normal Mode](#normal-mode) to allow editing of a
custom, task prompt that's not saved to the configuration of the
extension.

The "Normal" button will go back to [Normal Mode](#normal-mode).

*The environment and profile selectors will always be active when in
this mode.*

### Toolbar
Place predefined shortcuts for environment + profile + task
combinations in a floating toolbar.

*Note that clicking on the toolbar will open the popup and run the
shortcut.*

## Configurations and Terms
The full list of configuration options and details about the terms we
use.

### Scope and Workspaces
Every operable site for `SiteCompanion` is in a workspace.

There are three scopes:
1. Global workspace ("global" for short): defines the baseline
   configurations.
2. User-defined workspace ("workspace" for short): defines the
   configurations for a class of workflows. Workspaces always inherit
   the global configurations.
3. Site-specific ("site" for short): defines the configuration for each
   site. May inherit the global workspace or a user-defined
   workspace. Must always inherit a workspace.
   
`SiteCompanion` operates on a specific site at a time.

### Configuration Inheritance
Each scope may inherit some configurations from its parent, and can
**always** override them by shadowing.

*Any configuration that can be inherited by a workspace must be
inheritable by a site.*

If not explicitly mentioned, a configuration is **always**
inheritable.

#### Disabling Inherited Configurations
Any inherited configuration can be disabled in the current scope, and
a child may only inherit the enabled configurations of its parent.

The state of an inherited configuration is configurable by clicking
the toggling buttons in the "Inherited" sections of each individual
configuration.

### Appearance
`SiteCompanion` comes with the following appearance customization
options that can be inherited:
1. Theme: choose the theme of the extension popup and the toolbar.
   The settings UI will use the global theme.
2. Toolbar Position: choose where the toolbar appears on known sites.
3. Always Use Default Env/Profile: enabling this option will disable
   the environment and profile selection fields in the popup UI.
4. Empty Toolbar: let the toolbar hide or show a button called "Open
   SiteCompanion" when the toolbar is empty in the current site.

##### Global-Only Appearance Configurations
Some configurations are only applicable globally.

1. Auto-hide toolbar on unknown sites: Turning on this option will
   hide the toolbar when the current site is not known by
   `SiteCompanion`.
2. Always show output buffer in popup UI: Turning this off will show
   the output buffer even when the site is unknown.

### API Keys (Global Only)
The keys for authenticating with the AI service provider.

### API Configurations
Configures the details of AI service endpoints:
1. API Key: which API key to use.
2. API (Base) URL: what the URL to the AI service endpoint is.
3. Model Name: what model to use.

*Workspaces and sites may only inherit API configurations of their
parents, and never create their own.*

#### Advanced Mode
To accommodate different API request formats, `SiteCompanion` offers
"Advanced Mode" for a more customizable experience.

In "Advanced Mode", you may directly edit the API endpoint URL and the
`JSON` template for requests.
   
### Environments
Environments are bundles of API configuration and a system prompt.
They define the environment in which the task is running.

An environment contains the following components:
1. API configuration: select the API configuration to use for this
   environment.
2. System prompt: the piece of prompt that defines the profile of the
   model.
   
### Profiles
User profiles to give more context to the model about **who you are**.

### Tasks
Prompts that tell the model **what to do**.

#### Task Defaults
A task will be associated with a default environment and profile
combination for quick access.

Of course, you may choose whichever environment and profile you want
to use in the popup UI.

### Toolbar Shortcuts
Configures the predefined shortcuts that appear on the toolbar.

Each shortcut is a combination of environment + profile + task.

### Site-Specific Configurations
Some configurations are site-specific. They are there to configure how
`SiteCompanion` recognizes a site, the workspace the site belongs to,
and how it extracts text from it.

The additional configuration options are:
1. URL Pattern: the globbing pattern to match URLs against for that
   site configuration.
2. Workspace: the workspace that the site belongs to.
3. Site Text Selector: the configuration for the pattern used by
   `SiteCompanion` to extract the text from the site.

#### Selector Patterns
The supported selector patterns are:
  * `{ kind: "css"; selector: string }`
  * `{ kind: "cssAll"; selector: string; index: number }`
  * `{ kind: "textScope"; text: string }`
  * `{ kind: "anchoredCss"; anchor: { kind: "textScope"; text: string }; selector: string }`


## Planned Features
Nothing at the moment!

Send a feature request to **Issues** if you'd like to request a new
feature!

## Known Bugs
Nothing at the moment!

Send a bug report to **Issues** if you find one!

## Disclaimer
1. The extension is not responsible for your actions. **YOU** must be
   responsible for your own actions.
2. `SiteCompanion` is free and will always be free; no party should
   offer paid services for `SiteCompanion` users.
3. If a branch/fork diverges from the design of `SiteCompanion`, it
   may not use its branding nor will it be merged into the official
   version.
4. No donations or other monetization will affect feature requests or
   bug fix priorities.
