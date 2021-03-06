
const YAML = require('yaml')
const fs = require('fs')
const AWS = require('aws-sdk');
var appRoot = require('app-root-path');
const jestPlugin = require('serverless-jest-plugin');
expect.extend({
    myToBe(response, value) {
        const pass = response.statusCode == value;
        if (pass) {
            return {
                message: () =>
                    `expected ${response.statusCode} =  ${value}`,
                pass: true,
            };
        } else {
            return {
                message: () =>
                    `expected:${response.statusCode},received: ${value}, message:${(response.body)} `,
                pass: false,
            };
        }
    },
});
function test(configFilePath = 'test_config.yml', lambdaPath = "/src/lambda/") {
    var test_config = fs.readFileSync(configFilePath, 'utf8')
    const testDirection = YAML.parse(test_config);
    //기본 설정
    //aws profile
    var credentials = new AWS.SharedIniFileCredentials({ profile: testDirection.aws_profile });
    AWS.config.credentials = credentials;
    AWS.config.update({ region: testDirection.region });
    //환경 변수 설정
    testDirection.env.forEach((item, index) => {
        process.env[item.key] = item.value;
    });
    testDirection.test_targets.forEach((item, index) => {
        //method에 따른 input 설정
        //queryStringParameters,body에 둘다 넣는다. 
        let input = { queryStringParameters: item.parms, body: JSON.stringify(item.parms) };
        const mod = require(appRoot + lambdaPath + item.uri);
        const lambdaWrapper = jestPlugin.lambdaWrapper;
        const wrapped = lambdaWrapper.wrap(mod, { handler: 'handler' });
        it(item.uri + ((item.description) ? " " + item.description : ""), async () => {
            return wrapped.run(input).then(async (response) => {
                console.log("\u001b[1;35m " + item.uri + ": result:" + JSON.stringify(response) + "\u001b[1;0m")
                try {
                    await expect(response).myToBe(200);
                }
                catch (e) {
                    throw e;  // <= set your breakpoint here
                }
            })
        });
    });
}
module.exports.test = test;