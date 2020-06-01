import { intentsJSONWithValues } from './IntentsJSONGenerator.js';
import { AppBase } from 'pia/baseapp/AppBase.js';
import { Intent } from 'pia/baseapp/Intent.js';
import { Client } from 'pia/client/Client.js';
import { getConfig } from 'pia/util/config.js';
import { assert } from 'pia/util/util.js';
import cryptoRandomString from 'crypto-random-string';

const kOurPortFrom = 12127;
const kOurPortTo = 12712;
var gAuthKey = null;
const kCoreURL = "http://localhost:12777";

/**
 * Wraps a Pia voice app as a HTTP REST server.
 * The caller is in all cases Pia core.
 *
 * Reads the basic intents and commands from a JSON file.
 * Then loads the app and lets it add the available values
 * for each type.
 * Then we register our app with the Pia core.
 *
 * We also listen to URLs for each app intent, in the form
 * <http://localhost:12127/:appid/:intent> (POST)
 * They will be called when the user invoked a voice command.
 * Parameters are passed as JSON.
 * The result is a JSON with either a sentence as response to the user,
 * or an error message and code.
 */
export default class HTTPAppServer {
  constructor(apps) {
    assert(apps.length, "Need array of apps");
    apps.forEach(app => assert(app instanceof AppBase, "apps item has wrong type"));
    this.apps = apps;
  }

  async start() {
    gAuthKey = cryptoRandomString({length: 10});

    this._client = new Client();
    await this._client.loadApps(apps);
    this._expressApp = this._createServer();
    await this._registerWithCore();
  }

  _createServer() {
    let expressApp = express();
    let server = http.createServer(app);
    expressApp.set("json spaces", 2);
    expressApp.use(fromWebsite);
    expressApp.options("/*");
    this._findFreePort(server);

    // Register the REST URL handler for each intent
    for (let app of this.apps) {
      for (let intent of Object.values(app.intents)) {
        assert(intent instanceof Intent);
        expressApp.post(`/${app.id}/${intent.id}`, authenticator, express.json(), (req, resp) => catchHTTPJSON(req, resp, async () =>
          await this.intentCall(intent, req.body)));
      }
    }

    return app;
  }

  /**
   * Calls `server.listen(port)` with a random port.
   */
  _findFreePort(server) {
    let failures = 0;
    let width = kOurPortTo - kOurPortFrom;
    while (1) {
      try {
        let port = kPortFrom + Math.ceil(Math.random() * width);
        console.info(`Trying port ${port}`);
        server.listen(port);
        this._port = port;
        console.log(`Listening on port ${port} with auth key ${this._authKey}`);
      } catch (ex) {
        console.error(ex);
        if (ex.code == "foo") {
          if (++failures > width * 2) { // infinite loop protection
            throw ex;
          }
          // continue looping
        } else {
          throw ex;
        }
      }
    }
  }

  /**
   * Notify the Pia core of us
   */
  async _registerWithCore() {
    let coreURL = getConfig().coreURL || kCoreURL;
    if (!coreURL.endsWith("/")) {
      coreURL += "/";
    }
    let myURL = `http://localhost:${this._port}/`;
    if (!coreURL.includes("//localhost:")) {
      myURL = `http://${os.hostname()}:${this._port}/`;
    }
    for (let app of this.apps) {
      let json = {
        appID: app.id,
        url: myURL,
        intents: intentsJSONWithValues(app),
      };
      await r2.put(coreURL, { json: json });
    }
  }

  /**
   * The user invoked an intent command and the
   * Pia core called us to run the intent.
   *
   * Map it from HTTP and JSON to intent call.
   *
   * @param intent {Intent}
   * @param request {HTTP server request}
   *   Must have body already converted to JSON
   */
  async intentCall(intent, request) {
    // TODO map back NamedValues from term to value
    // TODO sanitize and security-check the arguments
    let args = request.body.args;

    let langs = intent.app.languages || [ "en" ]; // TODO
    this._client.lang = request.acceptsLanguages(langs) || "en";
    // TODO due to async, another call can overwrite lang again.
    // Need to make a new ClientAPI or Client object just for this call.

    return await intent.run(args, this._client.clientAPI);
  }
}


/**
 * Ensures that Pia core is calling us.
 * Insists on a key that was sent to Pia core during registration.
 *
 * Prevents that other software contacts us and leaches user data.
 *
 * Express middleware
 * @param request  {Request}  The request whose header to check
 * @param response {Response} Allows errors to be reported
 * @param next     {Function} Callback to continue processing the request
 */
function authenticator(request, response, next) {
  let receivedKey = request.header("X-AuthToken") || request.query.auth;

  if (receivedKey && receivedKey == gAuthKey) {
    next();
  } else {
    response.sendStatus(401);
  }
}


/**
  * Calls `func`, returns the JSON as response to the HTTP client,
  * and catches exceptions and returns them to the HTTP client.
  *
  * @param func {Function} A function that returns JSON
  */
function catchHTTPJSON(request, response, func) {
  try {
    // TODO Ensure that the caller is a Pia core
    // belonging to the user. The responses will
    // include lots of personal information,
    // and this is a server, so we need to verify.
    let json = func();
    response.json(json);
  } catch (ex) {
    response.send(ex.code || 400, ex.message);
  }
}

class HTTPError extends Error {
  constructor(httpErrorCode, message) {
    super(message);
    this.code = httpErrorCode;
  }
}
