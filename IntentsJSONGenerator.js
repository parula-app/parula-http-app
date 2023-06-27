import { FiniteDataType } from 'parula/baseapp/datatype/FiniteDataType.js';
import { EnumDataType } from 'parula/baseapp/datatype/EnumDataType.js';
import { ListDataType } from 'parula/baseapp/datatype/ListDataType.js';
import { NamedValuesDataType } from 'parula/baseapp/datatype/NamedValuesDataType.js';
import { assert } from 'parula/util/util.js';

/**
 * Generates the intents JSON file for the app,
 * plus the allowed values for each finite type.
 *
 * This re-builds the intents JSON file
 * from the available data in the apps class.
 * This is slightly different from the intents JSON file on disk, because:
 * 1. it contains the list/finite values expanded based
 * on the data that the app loaded,
 * 2. responses removed.
 * 3. the commands have already been expanded.
 *
 * @param app {AppBase}
 * @returns {JSON} intents JSON
 */
export function intentsJSONWithValues(app) {
  assert(app.intents, "App has wrong type");

  let intentsJSON = {
    interactionModel: {
      languageModel: {
        invocationName: app.id,
        intents: Object.values(app.intents).map(intent => ( {
          name: intent.id,
          samples: intent.commands,
          slots: Object.entries(intent.parameters).map(([ name, param ]) => ( {
            name: name,
            type: param.dataType.id
          } ))
        } )),
        types: []
      }
    }
  };

  // types
  let typesJSON = intentsJSON.interactionModel.languageModel.types;
  let dataTypes = new Set();
  for (let intent of Object.values(app.intents)) {
    for (let type of Object.values(intent.parameters)) {
      dataTypes.add(type);
    }
  }
  for (let dataType of dataTypes) {
    if (!(dataType instanceof FiniteDataType)) { // TODO will always be false
      continue;
    }
    let values = [];
    for (let value of dataType.terms) {
      values.push({
        id: value, // TODO Enum, List, NamedValues
        name: {
          value: value,
        }
      });
    }
    typesJSON.push({
      name: dataType.id,
      values: values,
    });
  }
  return intentsJSON;
}
