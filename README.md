# DarwinKit

WIP

DarwinKit is a tool for mapping and/or validating tabular biodiversity data with the Darwin Core standard (DwC).

The core features are a mapping component, a transforming component, and a validating component. The underlying system utilizes declarative, deterministic configuration which describes the mapping, transforming, and validation procedures.

The configuration allows for using each component independently. Mapping can produce pass-through outputs if desired, directly mapping the source fields to target fields. Transformation can also occur on given fields without them needing to be mapped. Finally, Mapping could be defined which is than validated, without a transformation step. Although the components can be defined with interdependent values and behaviours (column A implies conditions for column B during validation), they can operate with entirely isolated behaviours.

## Why?

### We work with DwC data

Our team works with biodiversity and genomics data. When we collect our data, we're collecting data which typically adheres to DwC.

### However, we don't record it as DwC data

Unfortunately, we tend to collect this data using labels and formats which aren't quite compatible with DwC; at least, not directly. They need mild re-labelling and coercion to adhere to the standard.

### DwC is a large, complex standard with hundreds of fields

I believe part of why we don't work off of the standard is because it's a non-trivial task to learn it, retain what you've learned, and apply it. This tool aims to address that problem by using several strategies to reduce this innate friction.

### Common problems we encounter

Biodiversity and genomics teams face recurring data challenges:

- **Coordinate inconsistencies**: GPS data recorded as "45.5231 N, 74.0060 W" instead of decimal degrees, breaking downstream GIS analysis
- **Taxonomic ambiguity**: Species names like "Atlantic salmon" or local names that don't validate against authoritative registries like WoRMS
- **Date format chaos**: Collection dates as "June 15th, 2023", "15/6/23", or "2023-165" (Julian) requiring manual parsing
- **Measurement unit confusion**: Depths in meters vs fathoms, temperatures in Celsius vs Fahrenheit, without clear metadata
- **Sample metadata gaps**: Missing or inconsistent specimen preparation methods, preservation protocols, or collection instruments

### Adhering to standards lets us work cleaner, better, and faster

At the moment, we write bespoke scripts which are tailored to specific datasets. We face issues such as:

- These datasets come from study designs which are not based on DwC. Many of the outputs are not as clean as they could be, but improvements require extensive scripting
- Modifying the script requires someone very technical with a programming environment configured
- Scripts become unmaintainable as team members leave or priorities shift
- Each new dataset requires starting from scratch, even when similar to previous work

Ensuring we stay close to the DwC standard provides us with many advantages with little investment.

1. **Clear communication**: When we all speak the same language, we communicate better and make fewer mistakes
2. **Automatic compatibility**: Datasets become compatible with each other without manual intervention
3. **Reusable analysis**: R scripts for biodiversity analysis work across projects when data follows the same structure  
4. **Tool interoperability**: GBIF, iNaturalist, and other platforms can directly ingest standardized data
5. **Quality assurance**: Validation catches errors before they propagate through analysis pipelines

### Collaboration and data sharing benefits

Working with standardized data transforms how science teams collaborate:

- **Cross-project integration**: Combine data from multiple field seasons or research groups without custom merge scripts
- **Publication readiness**: Journals increasingly expect data in standard formats for supplementary materials
- **Grant compliance**: Funding agencies require data management plans that often specify standard formats
- **Global contribution**: Data can be contributed to international databases like GBIF, Ocean Biogeographic Information System, and GenBank seamlessly

### Preventing downstream analysis failures

Validation catches problems that would otherwise surface as:

- **Statistical analysis errors**: Mixed coordinate systems causing incorrect distance calculations in species distribution models
- **Visualization failures**: Malformed dates breaking temporal plots in biodiversity trend analysis  
- **Database import rejections**: Invalid taxonomic names preventing upload to repository systems
- **Reproducibility issues**: Undocumented transformations making published analyses impossible to replicate
- **Collaboration bottlenecks**: Data quality questions consuming weeks of back-and-forth communication


## Workflow

There are multiple ways of using this logic. Fundamentally, it operates on files containing tabular data. A source file with a corresponding configuration file can be deterministically mapped, transformed, and validated.

One abstraction on this concept is a GUI which defines projects containing files. These files can each have respective configurations.

Another would be defining mapping as JSON and performing it in a Github action, or validations as JSON. This would allow taking arbitrary data and validating it according to the instructions in the JSON.

In the case of the GUI, project data would be stored in a database for future reference, to ensure data is normalized and stewarded by the application layer logic over time. This removes cognitve overhead from the scientists doing this work.

In all cases, validations are performed by functions within this code base. Efforts should be made in order to ensure that validation is normalized, type safe, versioned, and fully tested against many sample datasets.

### Users

Users are scientists 

## Components

### Mapping

The mapping component allows users to define how source data's columns align with the Darwin Core standard. For example, if you store your organism sex data in a column called 'gender', you can declare that it is meant to be the "sex" field in Darwin Core.

### Transforming

Then, if your 'gender' column uses values like "F" for female, "M" for male, "H" for hermaphrodite, etc. then you can transform this data by declaring how it maps to the controlled vocabulary for 'sex' in Darwin Core.

This transformation could also be used for formatting GCS coordinates properly, other controlled vocabularies, generating taxonomy from the WoRMS registry, formatting dates, and more.

### Validating

Each target field has its own means of being validated by default, so upon executing a mapping and transforming process, validation can be applied according to the known validations attached to the output fields.

In controlled vocabularies, we know that if the vocabulary is strict, it must only contain the controlled terms. Sometimes, the vocabulary is only recommended, and we can warn for fields which do not adhere to the vocabulary but still pass the validation.

With dates, we can ensure that all values passed into the transformation were able to be inferred as dates reliably, and that their outputs are valid dates as well.

GCS coordinates should always be within their respective numeric bounds.

There are many other ways to validate the data, but this is an overview.

## Target standards

The initial target is Darwin Core, as all of our source data is biodiversity and eDNA research at the moment. Over time, other standards and extensions will be included.

### Versions

Each standard can have a version. Versioning can occur at the field level, or at the standard level; it's up to the implementor to choose which tier dictates the version. In some standards, a field can be updated to use new semantics or validation strategies without the entire standard upgrading to a new version. As such, a standard should be maintained accordingly in our database. Ideally, a version is pinned to the standard itself and the verison field on related fields inherits from the parent standard.

### Extensions

Standards can be extended with non-standard fields. These extensions and their respective fields must be grouped and clearly defined as extensions. This allows for adding fields for the eMoF or DNADerivedData.

## Types and Semantics

As source data represents data which has both primitive types (string, integer, boolean) and semantic types (dates, vocabularies, measurements), source fields should indicate their primitive and semantic types as clearly as possible. This allows for coarse and refined compatibility for determining how fields can be mapped, transformed, and ultimately validated.

The system driving field compatibility and validation is a faceted semantic system which allows us to define how humans think of and mentally/intuitively group fields within standards, how types are semantically compatible, and ultimately, how field data can be semantically valid. This allows us to provide guided user interfaces, such as:

- A GUI which presents only compatible fields as options for targets for a source field according to the source's semantics
- Capturing incompatible field configurations and outputting errors which explain the incompatibility and suggest compatible options as alternatives
- Providing an interactive CLI which narrows down mapping/transformation options to prevent overwhelming lists that are slow to navigate through

## Using this code

The core of this tool is designed to be highly portable such that it can power a CLI, HTTP API, or GUI. The functions can all be tested in isolation or as parts of larger programs such as a CLI tool which validates files at rest in Github actions.

At the moment, these programs are not defined, but will eventually exist here as part of a monorepo.
