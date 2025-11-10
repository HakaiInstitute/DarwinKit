const fs = require('fs');
const txml = require('txml');

// Read the XML file content
const exMoFxml = './external/rs_gbif/extension/obis/extended_measurement_or_fact_2023-08-28.xml';
const eventXml = './external/rs_gbif/core/dwc_event_2025-07-10.xml';
const occurrenceXml = './external/rs_gbif/core/dwc_occurrence_2025-07-10.xml';
const taxonXml = './external/rs_gbif/core/dwc_taxon_2025-07-10.xml';
const DNAXml = './external/rs_gbif/extension/gbif/1.0/dna_derived_data_2024-07-11.xml';


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

const xmlSchemaToJson = (filePath,group) => {
    console.log(`Reading Schema file ${filePath}`,)

    const inputXML = fs.readFileSync(filePath, 'utf8');
   
    // Parse the XML string
    const xmlObject = txml.parse(inputXML);

    // Simplify the parsed object into a more straightforward JSON structure
    const simplifiedJson = txml.simplifyLostLess(xmlObject);

    simplifiedJson.extension[0].property = 
        simplifiedJson.extension[0].property.reduce((acc, prop) => {
            const { name, thesaurus, ...rest } = prop._attributes;
            let collection = {
                ...acc,
                [name]: {...rest}
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

exMoFjson = xmlSchemaToJson(exMoFxml, 'ExtMoF');
eventJson = xmlSchemaToJson(eventXml);
occurrenceJson = xmlSchemaToJson(occurrenceXml);
taxonJson = xmlSchemaToJson(taxonXml);
DNAJson = xmlSchemaToJson(DNAXml, 'DnaDD');

schemaJson = {...exMoFjson, ...eventJson, ...occurrenceJson, ...taxonJson};

// Log the JSON output to the console
// console.log(JSON.stringify(schemaJson, null, 2));

fs.writeFileSync("./external/dwcSchema.json", JSON.stringify(schemaJson, null, 2));

