
const YAML = require('yaml')
const fs = require('fs')
const AWS = require('aws-sdk');
var appRoot = require('app-root-path');
const jestPlugin = require('serverless-jest-plugin');
const { fail } = require('assert');
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
    beforeAll(async () => {
        //기본 설정

        try {
            jest.setTimeout(testDirection.timeout ? testDirection.timeout : 20000);
            var credentials = new AWS.SharedIniFileCredentials({ profile: testDirection.aws_profile });
            AWS.config.credentials = credentials;


            if (testDirection.roleArn) {
                const sts = new AWS.STS();
                const timestamp = (new Date()).getTime();
                const params = {
                    RoleArn: testDirection.roleArn, RoleSessionName: `rw-lambda-tester-${timestamp}`
                };
                const data = await sts.assumeRole(params).promise();
                AWS.config.update({
                    accessKeyId: data.Credentials.AccessKeyId,
                    secretAccessKey: data.Credentials.SecretAccessKey,
                    sessionToken: data.Credentials.SessionToken,
                });
            }


            process.env.region = testDirection.region;
            AWS.config.update({ region: testDirection.region });
            //환경 변수 설정
            testDirection.env.forEach((item, index) => {
                process.env[item.key] = item.value;
            });
        } catch (e) {

            process.exit("could not assume the role:" + testDirection.roleArn)
        }
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