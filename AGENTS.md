# AGENTS.md

This document defines how an **agent (human or LLM‑assisted)** should migrate the existing **WWCompanion** codebase, concepts, and behaviors into **SiteCompanion**, *without rewriting from scratch*. The migration is **patch‑style**: refactor, rename, generalize, and constrain—never invent new execution semantics.


SiteCompanion is a **tool, not a product**. It exists to remove copy/paste friction while preserving explicit user intent. Automation is restricted to **context binding only**.

---


## 0. Prime Directive (Non‑Negotiable)

**Preserve the execution model.**

> Nothing may execute without an explicit user click.


Allowed:


* Automatic **context restoration** (workspace loading on navigation)

* UI reinjection on DOM mutation (idempotent)


Forbidden:

* Auto‑execution
* Background scraping
* Inferred intent
* Heuristic task selection

If a change violates this, it is **out of scope**.

---

## 1. Terminology Mapping (Rename, Don’t Reimagine)

| WWCompanion | SiteCompanion | Notes                                              |
| ----------- | ------------- | -------------------------------------------------- |

| Companion   | SiteCompanion | Tool rename only                                   |
| Prompt      | Task          | **Tasks are the most basic execution unit**        |
| Quick Run   | Shortcut      | Shortcut = preconfigured run                       |
| Context     | Site Text     | Explicitly bound via paste/selection               |
| Profile     | Profile       | Same meaning, now workspace-scoped                 |
| Mode        | Env           | Execution discipline (system prompt + constraints) |

Rules:

* The constructed prompt must use **`Profile`** as the header name for user context
* The extension must **never emit `Resume` as a pipeline header or constant prompt text**
* Users may supply resume-like content, but it is always placed under the `Profile` header

Do **not** introduce new conceptual layers.


---

## 2. Core Execution Pipeline (Must Remain Intact)


The execution pipeline is stable and final:

```
Env (system prompt + discipline)
→ Profile (opaque user context)

→ Task (semantic intent template)
→ Site Text (primary extracted text)
```


Rules:

* The pipeline must **not** contain a `Resume` stage
* Prompt headers must use **exactly** these names
* **Tasks** are the most basic executable unit

* **Shortcuts** bind `(env + profile + task)`
* Shortcuts are the **only pinnable and toolbar-exposed unit**

Agents must never collapse, rename, or reorder this pipeline.


---

## 3. Workspaces (Authoritative Model)

### 3.1 Root Global Workspace

SiteCompanion introduces a **real but hidden workspace** named **`global`**.

`global` is **not a special case** in code. It is a full workspace that:

* Always exists
* Is not user-deletable
* Is never auto-switched into

`global` owns:

* Global appearance defaults

* **Global API configuration (providers, endpoints, API keys)**

* Globally scoped Envs, Profiles, Tasks
* Global Presets


Rules:

* API configuration is **global-only** and **non-inheritable**
* `global` participates in inheritance like any other workspace

### 3.2 Workspace Definition

A **Workspace is a strict namespace**, but not an ownership boundary.

A workspace references:


* Appearance overrides
* Envs
* Profiles
* Tasks
* Presets
* Sites

### 3.3 Deletion Semantics


Deleting a workspace:


* **Does not delete** any Envs, Profiles, Tasks, Presets, or Sites

* Moves all referenced items to the **`global` workspace**
* Preserves names, identities, and semantics

Deletion therefore removes a *namespace*, not data.


### 3.4 Inheritance Model (Unified)

Scopes form a strict hierarchy:


```
global → workspace → site
```

Inheritance rules:

* Inherit by default
* Items may be disabled (subtractive)
* **Override by redefinition**: defining an item with the same name shadows the inherited one
* Nearest scope wins by name


Rules:

* No merging of semantics
* No inference
* APIs / API keys do **not** inherit

### 3.5 Migration Rule

If WWCompanion has:


* Global config
* Implicit defaults
* Cross-context state

Then:

* Move capability-like config into `global`
* Move user-meaningful items into a default migrated workspace
* Remove all implicit fallback logic


### 3.3 Inheritance Model (Unified)

Scopes form a strict hierarchy:

```
global → workspace → site
```


Inheritance rules:

* Inherit by default
* Items may be disabled (subtractive)
* **Override by redefinition**: defining an item with the same name shadows the inherited one
* Nearest scope wins by name

Rules:


* No merging of semantics
* No inference
* APIs / API keys do **not** inherit

### 3.4 Migration Rule

If WWCompanion has:


* Global config
* Implicit defaults
* Cross-context state

Then:

* Move capability-like config into `global`
* Move user-meaningful items into a default migrated workspace
* Remove all implicit fallback logic

---

## 4. Env & Profile Visibility (Final Decision)

In SiteCompanion:


* **Env selector is always visible**
* **Profile selector is always visible**

Even when:


* A preset defines defaults

Visibility = inspectability.

Agents must **not** introduce read‑only, hidden, or inferred env/profile states.

---

## 5. Tasks vs Shortcuts (Critical Separation)

### 5.1 Tasks


Tasks:

* Are the **most basic execution unit**
* Define semantic intent
* Are directly runnable via **manual popup execution**
* Define a **default Environment**
* Define a **default Profile**
* Are never pinnable

When a user selects or changes a Task in the popup:

* The Environment selector must refresh to the Task’s default Environment
* The Profile selector must refresh to the Task’s default Profile


### 5.2 Shortcuts

Shortcuts:


* Are concrete, named execution shortcuts
* Bind `(env + profile + task)` explicitly
* Are executable via **one click**
* Are pinnable
* **Never appear in the popup UI**

Shortcuts exist purely as **injected-toolbar shortcuts**.


### 5.3 Manual Execution (Popup Configuration)


The popup UI allows **manual execution of Tasks** using explicit configuration.

Rules:

* The popup UI must **never list or reference shortcuts**
* Manual execution must use the **same execution pipeline** as shortcuts

* Manual execution does **not** create a shortcut unless explicitly saved by the user
* Manual execution is equivalent to WWCompanion behavior

Migration rule:


> Any WWCompanion feature that "runs" something maps either to **manual Task execution** or to a **toolbar Shortcut**.

---

## 6. Site Binding & Context Extraction

### 6.1 Site Ownership


Each site:

* Belongs to exactly **one workspace**
* Has an explicit URL matcher
* Has an explicit extraction definition
* Inherits appearance, envs, profiles, tasks, presets from its workspace (unless overridden)


### 6.2 Unknown Sites (Two Paths Only)

When encountering an unknown site, **only two paths are allowed**:

#### Path A: Popup UI (default)


1. Toolbar appears in minimal state
2. User pastes or selects a portion of page text
3. System finds the *minimum DOM scope* whose `innerText` contains the pasted text
4. User confirms or retries
5. User selects workspace
6. Site config is created


#### Path B: Settings Page (manual)

* User defines URL matcher
* User defines extraction logic explicitly


Rules:

* No fuzzy matching
* No guessing
* No background scraping


---

## 7. Automatic Behavior (Strictly Limited)

Allowed automation:


* Loading a site’s associated workspace on navigation

Disallowed automation:


* Running presets
* Selecting presets
* Modifying env/profile/task

**Context may be restored. Intent may not be inferred.**

---

## 8. UI & Interaction Rules


SiteCompanion has **three UIs**, each with a strict role boundary. Wherever applicable, UI layout, interaction patterns, and visual hierarchy must **respect WWCompanion’s existing design**.


### 8.1 UI Surfaces (Authoritative)

1. **Floating Injected Toolbar**

   * Appears on **recognized sites** only
   * Floating, injected, idempotent on DOM mutation
   * Supported positions only: four corners + bottom center
   * Contains **toolbar presets only**


2. **Extension Popup UI**

   * Primary inspection, configuration, and manual execution surface

   * Never displays presets

   * State-machine driven (see below)

3. **Settings UI**

   * Configuration and organization surface only
   * No execution affordances


---

### 8.2 Floating Toolbar (Toolbar Presets Only)


The floating toolbar:

* Displays buttons named after **all enabled presets in scope for the current site**
* Executes a preset with **one click**
* Is the **exclusive surface** from which presets may be executed

Preset aggregation order:

1. Enabled **Global Presets**
2. Enabled **Workspace Presets**

3. Enabled **Site Presets**


Rules:

* Presets must never appear in the popup UI

* Presets must never appear in settings execution paths
* Presets should be labeled as **"Toolbar Presets"** where naming clarification is needed

---

### 8.3 Popup UI – State Machine

The popup UI has **exactly three states**, and **popup state must be persisted**.

Persistence rule:

* Closing the popup **must not reset state**
* Popup state is preserved until:

  * The user performs a manual action in the popup (selection / click), or
  * The user executes a toolbar Shortcut


State transitions are therefore **explicit and durable**.

---

#### State 1: Unknown Site

Shown when a site has no saved configuration.

UI elements:

* Prompt asking the user to paste **partial text** they want SiteCompanion to extract each time

* Button: **"Try Extracting Full Text"**


---

#### State 2: Extraction Review

Entered after attempting full-text extraction.

UI elements:


* Read-only buffer showing the extracted text
* Editable field to configure the **URL match pattern** for the site
* Button: **Retry** (returns to State 1)
* Button: **Confirm** (saves the site as recognized)

Validation rules:


* URL patterns must be explicit
* **No URL pattern may be a substring of another** (conflict error)

---


#### State 3: Normal Execution

Shown for recognized sites.

Rules:

* Layout must respect WWCompanion popup design
* Allows manual configuration of env, profile, and task
* Changing the Task refreshes env/profile to Task defaults
* Allows manual execution

* **Never displays shortcuts or shortcut-derived UI**

* Adds a single, read-only line indicating the **current Workspace**

---

#### State 2: Extraction Review

Entered after attempting full-text extraction.

UI elements:

* Read-only buffer showing the extracted text
* Editable field to configure the **URL match pattern** for the site
* Button: **Retry** (returns to State 1)
* Button: **Confirm** (saves the site as recognized)

Validation rules:

* URL patterns must be explicit
* **No URL pattern may be a substring of another** (conflict error)


---

#### State 3: Normal Execution

Shown for recognized sites.

Rules:

* Layout must respect WWCompanion popup design
* Allows manual configuration of env, profile, task, and site text
* Allows manual execution

* **Never displays presets or preset-derived UI**
* Adds a single, read-only line indicating the **current Workspace**

---

### 8.4 Naming & Display Rules (UI-Wide)


* Naming conflict checking is **case-insensitive**
* Display must **preserve the original casing** of the name as entered

---

### 8.2 Floating Toolbar (Presets Only)

The floating toolbar:

* Displays buttons named after **all presets enabled for the current site**
* Executes a preset with **one click**
* Is the **exclusive surface** from which presets may be executed

Preset source order:

* Enabled **Global Presets**
* Enabled **Workspace Presets**
* Enabled **Site Presets**

Rules:

* Presets must never appear in the popup UI
* Presets must never appear in the settings execution paths

---

### 8.3 Popup UI – State Machine


The popup UI has **exactly three states**.

#### State 1: Unknown Site

Shown when a site has no saved configuration.


UI elements:


* Prompt asking the user to paste **partial text** they want SiteCompanion to extract each time
* Button: **"Try Extracting Full Text"**

---

#### State 2: Extraction Review


Entered after attempting full-text extraction.


UI elements:

* Read-only buffer showing the extracted text
* Editable field to configure the **URL match pattern**
* Button: **Retry** (returns to State 1)

* Button: **Confirm** (saves the site as recognized)

Validation rules:

* URL patterns must be explicit
* **No URL pattern may be a substring of another** (conflict error)

---


#### State 3: Normal Execution

Shown for recognized sites.

Rules:

* Layout must respect WWCompanion popup design
* Allows manual configuration of env, profile, task, and site text
* Allows manual execution
* **Never displays presets or preset-derived UI**
* Adds a single line indicating the **current Workspace**

---

### 8.4 Naming & Display Rules (UI-Wide)

* Naming conflict checking is **case-insensitive**
* Display must **preserve the original casing** of the name as entered

---

---


## 9. Preset Scope, Enablement, and Naming

### 9.1 Preset Scope Resolution

Toolbar presets shown for a site are the union of:

* Enabled **Global Presets**
* Enabled **Workspace Presets** (if applicable)
* Enabled **Site Presets** (if applicable)


### 9.2 Enablement Semantics

* Presets may exist at global, workspace, or site scope
* Lower tiers inherit enable/disable state from parents by default
* A lower-tier preset with the same name **overrides and disables** the inherited one

### 9.3 Naming Scope

Naming is scoped as:

```
Enabled Global + Enabled Workspace + Enabled Site + Module Type
```

Rules:


* Conflict detection is case-insensitive within the same module type
* Display preserves original casing

---


## 10. Motion & UX Doctrine


Structural motion only:

* Viewport‑anchored reflow (FLIP pattern)
* Item stays visually fixed; UI reflows around it

Motion is:


* Structural, not decorative
* Respectful of reduced‑motion settings


---

## 11. Engineering & UX Constraints

### 11.1 Legacy WWCompanion Adapters (Removal Mandate)

Any of the following **must be removed**, not adapted:


* Legacy config adapters

* Compatibility shims
* Auto-migration layers that preserve old semantics at runtime


Migration is **one-time and destructive** at the semantic level.


Allowed:


* Data migration scripts

* Explicit renaming / reshaping of stored config


Forbidden:

* Dual-mode logic

* Runtime branching on legacy flags


---

### 11.2 Settings UI Structure (Authoritative)

The Settings UI contains the following top-level sections:

#### 1. Global Configuration

Acts as the **configuration baseline**.

Contains:

* Global appearance (theme, toolbar positioning, auto-hide on unknown sites)
* API Keys
* API Configurations
* Expandable / foldable lists of:

  * Environments
  * Profiles
  * Tasks
  * Presets

Each configuration entry:

* Is configuration-only (no execution)
* Has an enable / disable toggle

Also includes:


* Expandable / foldable list of **sites inheriting directly from global**

---

#### 2. Workspaces


Contains a list of workspace sections (all visible in sidebar TOC; TOC supports folding).


Each workspace section contains:


* Name
* Appearance overrides (inherits from global on creation)
* API configurations shown as **enable/disable toggles only**
* Expandable / foldable lists of:

  * Environments
  * Profiles
  * Tasks
  * Presets

Each list is split into:

* **Inherited** (toggle-based enable/disable)
* **Workspace-specific** (full configuration UI)

Also includes:

* Expandable / foldable list of **sites inheriting from this workspace**

---

#### 3. Sites

Mirrors the Workspace structure, minus the list of sites.


Rules:

* Lower tiers inherit both enabled/disabled state and defaults from parents
* On creation or parent change, inherited defaults must be refreshed
* If a site/workspace config name conflicts with an enabled inherited one:

  * The inherited one is automatically disabled
  * Helper text must explain the override

---


### 11.3 Duplication Semantics

For all non-API configurations, duplication must be offered as:

* **Duplicate to Workspace** (with selector)
* **Duplicate to Site** (with selector)

No generic duplicate buttons are allowed.

---

### 11.4 Naming & Conflict Detection

Naming rules are **case-insensitive and module-specific**.


Rules:

* Conflicts are detected case-insensitively
* Display preserves original casing
* Different module types may share the same name

---

### 11.5 Error Checking & Messaging

Error checking is **mandatory and non-removable**.

Agents:

* May refactor validation logic
* May strengthen invariants
* May change *where* errors are surfaced in the UI


Agents may **not**:

* Silence errors
* Convert errors into warnings
* Auto-recover from invalid state without user action

Errors must:


* Be explicit
* Be attributable to a concrete user action or config
* Not block unrelated UI inspection

---

### 11.6 UI Design Theme

Respect the existing SiteCompanion UI doctrine:

* Minimal surface area
* WWCompanion layout parity where applicable

* No instructional text in execution paths
* No decorative UI

* No icon-first navigation

UI exists to expose state, not to explain it.

---


## 12. Migration Checklist (Agent‑Facing)

An agent migrating WWCompanion must:

* [ ] Rename concepts using the mapping table

* [ ] Ensure constructed prompts use `Profile` (never `Resume`) as the header
* [ ] Introduce workspaces as hard namespaces

* [ ] Introduce the `global` workspace for capability config
* [ ] Split global state into workspace‑owned state
* [ ] Separate tasks from presets
* [ ] Ensure only presets execute
* [ ] Make env & profile selectors always visible
* [ ] Remove any auto‑execution logic
* [ ] Remove all legacy config adapters
* [ ] Enforce case‑insensitive, module‑local naming rules

* [ ] Constrain automation to context binding only
* [ ] Keep execution pipeline intact


If any step requires inventing behavior, stop.


---

## 13. Closing Doctrine

SiteCompanion is intentionally **narrow**.


It restores **clarity of intent** by enforcing boundaries:

* Context may be bound automatically
* Intent may only cross the boundary via an explicit click

Legacy convenience is not a justification for ambiguity.


> The tool must always make it obvious *what will run*, *with what*, and *why*.

Agents exist to preserve this clarity — not to smooth it away.

