import { AppBase } from 'pia/baseapp/AppBase.js';
import { Intent } from 'pia/baseapp/Intent.js';
import { FiniteDataType } from 'pia/baseapp/datatype/FiniteDataType.js';
import { EnumDataType } from 'pia/baseapp/datatype/EnumDataType.js';
import { ListDataType } from 'pia/baseapp/datatype/ListDataType.js';
import { NamedValuesDataType } from 'pia/baseapp/datatype/NamedValuesDataType.js';
import { assert } from 'pia/util/util.js';

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
  assert(app instanceof AppBase);

  let intentsJSON = {
    interactionModel: {
      languageModel: {
        invocationName: app.id,
        intents: this.intents.map(intent => ( {
          name: intent.id,
          samples: intent.commands,
          slots: Object.entries(intent.parameters).map(([ name, datatype ]) => ( {
            name: name,
            type: datatype.id
          } ))
        } )),
        types: {}
      }
    }
  };

  // types
  let typesJSON = intentsJSON.interactionModel.languageModel.types;
  let dataTypes = new Set();
  for (let intent of this.intents) {
    for (let type of Object.values(intent.parameters)) {
      dataTypes.add(type);
    }
  }
  for (let dataType of dataTypes) {
    if (!(dataType instanceof FiniteDataType)) {
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