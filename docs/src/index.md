---
title: "Overview"
nav_order: 1
description: "A configuration-driven toolkit for validating and transforming biodiversity data to Darwin Core."
---

# DarwinKit

DarwinKit maps, transforms, and validates raw biodiversity data to the
[Darwin Core](https://dwc.tdwg.org/) standard so you can share research data
with repositories like OBIS and GBIF.

## The problem

Biodiversity data is usually collected in a form convenient for field work,
not one compliant with Darwin Core. Repositories (OBIS, GBIF, BOLD) each add
their own validation rules, and you often can't be sure data is valid until you
submit it. Correcting this by hand or with bespoke scripts is slow and
error-prone.

## The solution

DarwinKit validates CSV biodiversity data against Darwin Core specifications
(and repository supersets) from a single `darwinkit.yaml` file. It checks field
mappings, renames columns, enforces referential integrity across related
datasets, validates controlled vocabularies, and catches data-quality problems
before submission.

Continue to [Installation](./installation.md) to get started.
