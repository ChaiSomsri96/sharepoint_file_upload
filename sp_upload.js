/*
 * NAME: nodejs-demo.js
 * AUTH: Brent Ely (https://github.com/gitbrent/)
 * DESC: Demonstrate SpRestLib on Node.js
 * REQS: Node 4.x + `npm install sprestlib`
 * EXEC: `node nodejs-demo.js (sp-username) (sp-password) {sp-hostUrl}`
 * VER.: 1.9.0
 * REL.: 20181210
 * REFS: HOWTO: Authenticate to SharePoint Online (*.sharepoint.com)
 * - https://allthatjs.com/2012/03/28/remote-authentication-in-sharepoint-online/
 * - http://paulryan.com.au/2014/spo-remote-authentication-rest/
 * - https://github.com/s-KaiNet/node-spoauth
*/

// Required Args
// =============
if ( process.argv.length < 5 ) {
	console.log("*ERROR*: Not enough arguments provided\n");
	console.log("Usage....: node nodejs-demo.js [spUsername] [spPassword] [spHostUrl]");
	console.log("Example..: node nodejs-demo.js admin@billg.onmicrosoft.com c@ashm0ney https://billg.sharepoint.com");
	process.exit(-1);
}

// SETUP: Load sprestlib and show version to verify everything loaded correctly
// ============================================================================
var fs = require('fs');
var https = require('https'); // this Library is the basis for the remote auth solution
var sprLib;
if (fs.existsSync('../dist/sprestlib.js')) {
	sprLib = require('../dist/sprestlib.js'); // for LOCAL TESTING
}
else {
	sprLib = require("sprestlib");
}

// Validate library loaded
if ( !sprLib || !sprLib.version ) {
	console.log('\nERROR:');
	console.log('sprLib does not exist!');
	process.exit(-1);
}

// SETUP: Set `nodeEnabled` flag so SpRestLib knows this is a Node app (tells library to use the `https` module)
sprLib.nodeConfig({ nodeEnabled:true });

// BEGIN DEMO:
console.log('\nStarting demo...');
console.log('================================================================================');
console.log(`> SpRestLib version: ${sprLib.version}\n`);

// Office365/On-Prem/Hosted Vars
var SP_USER = process.argv[2];
var SP_PASS = process.argv[3];
var SP_URL  = process.argv[4].replace(/\/$/gi,'');
var SP_HOST = SP_URL.toLowerCase().replace('https://','').replace('http://','');
var gBinarySecurityToken = "";
var gAuthCookie1 = "";
var gAuthCookie2 = "";
var gStrReqDig = "";
var gStrFilePath = "/sites/dev/Shared Documents/";	// text test
var gStrFileLoca = "./";							// text test
var gStrFileName = "sprestlib-demo.html";			// text test
/*
var gStrFilePath = "/sites/dev/Shared Documents/";	// binary test
var gStrFileLoca = "./img/";						// binary test
var gStrFileName = "setup01.png";					// binary test
*/

Promise.resolve()
.then(() => {
	// STEP 1: Login to MS with user/pass and get SecurityToken
	console.log(' * STEP 1/2: Auth into login.microsoftonline.com ...');

	return new Promise(function(resolve,reject) {
		var xmlRequest = '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">\n'
			+ '  <s:Header>'
			+ '    <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue</a:Action>'
			+ '    <a:ReplyTo><a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address></a:ReplyTo>'
			+ '    <a:To s:mustUnderstand="1">https://login.microsoftonline.com/extSTS.srf</a:To>'
			+ '    <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
			+ '      <o:UsernameToken>'
			+ '        <o:Username>'+ SP_USER +'</o:Username>'
			+ '        <o:Password>'+ SP_PASS +'</o:Password>'
			+ '      </o:UsernameToken>'
			+ '    </o:Security>'
			+ '  </s:Header>'
			+ '  <s:Body>'
			+ '    <t:RequestSecurityToken xmlns:t="http://schemas.xmlsoap.org/ws/2005/02/trust">'
			+ '      <wsp:AppliesTo xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy">'
			+ '        <a:EndpointReference><a:Address>'+ SP_URL +'</a:Address></a:EndpointReference>'
			+ '      </wsp:AppliesTo>'
			+ '      <t:KeyType>http://schemas.xmlsoap.org/ws/2005/05/identity/NoProofKey</t:KeyType>'
			+ '      <t:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</t:RequestType>'
			+ '      <t:TokenType>urn:oasis:names:tc:SAML:1.0:assertion</t:TokenType>'
			+ '    </t:RequestSecurityToken>'
			+ '  </s:Body>'
			+ '</s:Envelope>';

		var options = {
			hostname: 'login.microsoftonline.com',
			path    : "/extSTS.srf",
			method  : 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': xmlRequest.length
			}
		};

		var request = https.request(options, (res) => {
			let rawData = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => rawData += chunk);
			res.on('end', () => {
				var DOMParser = require('xmldom').DOMParser;
				var doc = new DOMParser().parseFromString(rawData, "text/xml");
				// KEY 1: Get SecurityToken
				if ( doc.documentElement.getElementsByTagName('wsse:BinarySecurityToken').item(0) ) {
					gBinarySecurityToken = doc.documentElement.getElementsByTagName('wsse:BinarySecurityToken').item(0).firstChild.nodeValue;
					resolve();
				}
				else {
					reject('Invalid Username/Password');
				}
			});
		});
		request.on('error', (e) => {
			console.log(`problem with request: ${e.message}`);
			reject();
		});
		request.write(xmlRequest);
		request.end();
	});
})
.then(() => {
	// STEP 2: Provide SecurityToken to SP site and get 2 Auth Cookies
	console.log(' * STEP 2/2: Auth into SharePoint ...');

	return new Promise(function(resolve,reject) {
		var options = {
			hostname: SP_HOST,
			agent: false,
			path: "/_forms/default.aspx?wa=wsignin1.0",
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': gBinarySecurityToken.length,
				'Host': SP_HOST
			}
		};

		// IMPORTANT: SharePoint online will only return the 2 auth cookies with https queries (it will respond to http, but not include cookies!)
		var request = https.request(options, (response) => {
			// KEY 2: Get 2 auth cookie values
			gAuthCookie1 = response.headers['set-cookie'][0].substring(0,response.headers['set-cookie'][0].indexOf(';'));
			gAuthCookie2 = response.headers['set-cookie'][1].substring(0,response.headers['set-cookie'][1].indexOf(';'));
			resolve();
		});
		request.on('error', (e) => {
			console.log(`problem with request: ${e.message}`);
			reject(e);
		});
		request.write(gBinarySecurityToken);
		request.end();
	});
})
.then((data) => {
	// STEP 3: Send requests including authentication cookies
	console.log(' * SUCCESS!! Authenticated into "'+ SP_HOST +'"');
	//console.log(`...gAuthCookie1:\n${gAuthCookie1}\n`);
	//console.log(`...gAuthCookie2:\n${gAuthCookie2}\n`);

	// A: SpRestLib requires 2 things: auth-cookie & server-name
	sprLib.nodeConfig({ cookie:gAuthCookie1+' ;'+gAuthCookie2, server:SP_HOST });

	// B: SpRestLib also needs the full path to your site
	sprLib.baseUrl('/sites/dev/');
	//console.log( 'sprLib.baseUrl = '+ sprLib.baseUrl() );

	// C: Now run all the sprLib API calls you want
	return sprLib.user().info();
})
.then((objUser) => {
	console.log('\nTEST 1: sprLib.user().info()');
	console.log('----------------------------');
	//console.log(objUser);
	console.log('Id.........: '+ objUser.Id);
	console.log('Title......: '+ objUser.Title);
	console.log('LoginName..: '+ objUser.LoginName);
	console.log('Email......: '+ objUser.Email);

	return sprLib.list('Site Assets').info();
})
.then((objInfo) => {
	console.log("\nTEST 2: sprLib.list('Site Assets').info()");
	console.log('-----------------------------------------');
	console.log('Created....: '+ objInfo.Created);
	console.log('ItemCount..: '+ objInfo.ItemCount);

	// CRUD Test:
	//sprLib.list('Departments').create({ Title:'node test' });
	// THIS WILL FAIL - "The security validation for this page is invalid and might be corrupted. Please use your web browser's Back button to try your operation again."
	// a `requestDigest` must be generated and included
	return sprLib.renewSecurityToken();
})
.then(strDigest => {
	gStrReqDig = strDigest;

	console.log("\nTEST 3: sprLib.list('Announcements').create()");
	console.log('---------------------------------------------');
	console.log('gStrReqDig..: '+ gStrReqDig);

	return sprLib.list({ name:'Announcements', requestDigest:gStrReqDig }).create({ "Title":"created with Node demo" });
})
.then((objCrud) => {
	console.log('..\n..create done!');
	console.log('New item ID...: '+ objCrud.ID);

	console.log("\nTEST 4: sprLib.rest() - upload a local file to 'Shared Documents' Library");
	console.log("------------------------------------------------------------");
	// NOTE: Do not use encoding option with `fs.readFileSync()`! (as is, returns a buffer that works for all file types)
	// @see: https://nodejs.org/api/fs.html#fs_fs_readfilesync_path_options
	return sprLib.folder(gStrFilePath).upload({
		name: gStrFileName,
		data: fs.readFileSync(gStrFileLoca+gStrFileName),
		requestDigest: gStrReqDig,
		overwrite: true
	});
})
.then((objFile) => {
	console.log('SUCCESS: `'+ objFile.Name +'` uploaded to: `'+ objFile.ServerRelativeUrl +'`' );

	console.log("\nTEST 5: sprLib.file().get() - get a file from 'Shared Documents' Library");
	console.log("------------------------------------------------------------");
	return sprLib.file(gStrFilePath+'/'+gStrFileName).get();
})
.then((fileBuffer) => {
	if ( fileBuffer ) {
		var strFileGet = 'node-file-get-'+ new Date().toISOString().replace(/\:|\.|\-/g,'') +'-'+ gStrFileName;
		// NOTE: A binary buffer is returned by `file().get()` - save it using code below
		fs.writeFileSync( strFileGet, Buffer.from(fileBuffer,'binary') );
		console.log('SUCCESS: "'+ strFileGet +'" downloaded!');
	}
	else {
		console.log('FAIL: `fileBuffer` is empty');
	}
})
.then(() => {
	console.log('\n================================================================================');
	console.log('...demo complete.\n');
})
.catch((strErr) => {
	console.error('\n!!! ERROR !!!');
	console.error(strErr);
	return;
});