const fs = require('fs');
const txml = require('txml');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const csv = require('csvtojson');

// Read the XML file content
const exMoFxml = './external/rs_gbif/extension/obis/extended_measurement_or_fact_2023-08-28.xml';
const eventXml = './external/rs_gbif/core/dwc_event_2025-07-10.xml';
const occurrenceXml = './external/rs_gbif/core/dwc_occurrence_2025-07-10.xml';
const taxonXml = './external/rs_gbif/core/dwc_taxon_2025-07-10.xml';
const DNAXml = './external/rs_gbif/extension/gbif/1.0/dna_derived_data_2024-07-11.xml';

const obisChecklistUrl = 'https://raw.githubusercontent.com/iobis/manual/master/docs/OBIS-termchecklist.csv';

const xmlThesaurusToJson = (inputID) => {

    thesaurusPath = inputID.replace('http://rs.gbif.org/', './external/rs_gbif/').replace('https://rs.gbif.org/', './external/rs_gbif/');
    console.log(`    Getting vocabulary from ${thesaurusPath}`);
    const thesaurusXml = fs.readFileSync(thesaurusPath, 'utf8');
    const xmlObject = txml.parse(thesaurusXml.replaceAll("<voc:", "<").replaceAll("</voc:", "</"));
    const simplifiedJson = txml.simplifyLostLess(xmlObject);

    simplifiedJson.thesaurus[0].concept = simplifiedJson.thesaurus[0].concept.reduce((acc, concept) => {
        const { _attributes, preferred, alternative, } = concept;
        AltRepresentations = []
        preferred?.forEach(alt => {
            AltRepresentations = AltRepresentations.concat(alt.term?.filter(term => term._attributes["xml:lang"] === 'en'));
        });
        alternative?.forEach(alt => {
            AltRepresentations = AltRepresentations.concat(alt.term?.filter(term => term._attributes["xml:lang"] === 'en'));
        });
        AltRepresentations = AltRepresentations.map(alt => alt?._attributes["dc:title"]);
        const { "dc:identifier": identifier, ...restAttrs } = _attributes;
        return { ...acc, [identifier]: { ...restAttrs, "names": AltRepresentations }, };
    }, {});

    simplifiedJson.thesaurus =
        simplifiedJson.thesaurus.reduce((acc, prop) => {
            const { _attributes, ...restProps } = prop;
            return { ...acc, ..._attributes, ...restProps };
        }, {}
        );

    return simplifiedJson.thesaurus
}

const xmlSchemaToJson = (filePath,options) => {
    const { group, idFieldName } = options;
    console.log(`Reading Schema file ${filePath}`,)

    const inputXML = fs.readFileSync(filePath, 'utf8');
   
    // Parse the XML string
    const xmlObject = txml.parse(inputXML);

    // Simplify the parsed object into a more straightforward JSON structure
    const simplifiedJson = txml.simplifyLostLess(xmlObject);

    simplifiedJson.extension[0].property = 
        simplifiedJson.extension[0].property.reduce((acc, prop) => {
            const { name, thesaurus, required, "group": propGroup, ...rest } = prop._attributes;
            let unique = "false";
            if (name == idFieldName){
                unique = "true";
            }
            let collection = {
                ...acc,
                [name]: { "group": propGroup, ...rest, "gbif_required": required, unique }
            }
            if (group){
                collection[name].group = group;
            }
            if (thesaurus){
                thesaurusJson = xmlThesaurusToJson(thesaurus)
                collection = { ...collection, thesaurus, "values": thesaurusJson.concept }
            }
            return collection
        }, {}
        );

    simplifiedJson.extension =
        simplifiedJson.extension.reduce((acc, prop) => {
            const { _attributes, ...restProps } = prop;
            const { name, ...rest } = _attributes;
            return { ...acc, [name]: {...rest, ...restProps} };
        }, {}
);

    return simplifiedJson.extension;
}


async function main() {

    exMoFjson = xmlSchemaToJson(exMoFxml, { group: 'ExtendedMeasurementOrFact', idFieldName:"measurementID"});
    eventJson = xmlSchemaToJson(eventXml, { idFieldName:"eventID"});
    occurrenceJson = xmlSchemaToJson(occurrenceXml, { idFieldName:"occurrenceID"});
    taxonJson = xmlSchemaToJson(taxonXml, { idFieldName:"taxonID"});
    DNAJson = xmlSchemaToJson(DNAXml, { group: 'dnaDerivedData', idFieldName:"samp_name"});

    const schemaJson = { ...exMoFjson, ...eventJson, ...occurrenceJson, ...taxonJson, ...DNAJson };

    console.log('Fetching OBIS checklist...');
    const response = await fetch(obisChecklistUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${obisChecklistUrl}: ${response.statusText}`);
    }
    const csvText = await response.text();
    const obisChecklist = await csv().fromString(csvText);

    fs.writeFileSync("./external/obisChecklist.json", JSON.stringify(obisChecklist, null, 2));

    console.log('Joining OBIS checklist with schema...');
    obisChecklist.forEach(item => {
        const term = item.Term;
        Object.keys(schemaJson).forEach(key => {
            const table = schemaJson[key];
            if (table.property[term]) {
                table.property[term] = { ...table.property[term], "obis_required": item["OBIS Required"] };
            }
        })
    });

    // Log the JSON output to the console
    // console.log(JSON.stringify(schemaJson, null, 2));
    fs.writeFileSync("./external/dwcSchema.json", JSON.stringify(schemaJson, null, 2));
    console.log('Schema with OBIS checklist written to ./external/dwcSchema.json');
}

main().catch(console.error);
