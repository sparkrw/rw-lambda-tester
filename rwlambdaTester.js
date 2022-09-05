
const YAML = require('yaml')
const fs = require('fs')
const AWS = require('aws-sdk');
var appRoot = require('app-root-path');
const jestPlugin = require('serverless-jest-plugin');
const { fail } = require('assert');
const JSON5 = require('json5');
const moment = require('moment');
const excuted_timestamp = moment().valueOf();

function isPrimitive(test) {
    return test !== Object(test);
}

function getValue(subject) {
    if (typeof subject != "string") {
        return subject;
    }
    let sign = subject.substring(0, 1);
    //커스텀 함수값
    if (subject == "$now") {
        return moment().valueOf();
    }
    else if (subject == "$excuted_timestamp") {
        return excuted_timestamp;
    }
    //이미 저장된 값
    else if (sign == "@") {
        let key = subject.substring(1);
        return saveValue[key];
    }
    else {
        return subject
    }
}
function _iterateExpect(response, value, path = "") {
    if (isPrimitive(value)) {
        if (response == value) {
            return {
                message: () =>
                    `expected ${value} =  ${value}`,
                pass: true,
            };
        } else {
            return {
                message: () =>
                    `expect ${path} to be ${value}, received: ${response}`,
                pass: false,
            };
        }
    }
    else {
        for (const property in value) {
            if (!response[property]) {
                return {
                    message: () =>
                        `expect ${path} to be ${value},not exist `,
                    pass: false,
                };

            }
            else {
                let tempResult = _iterateExpect(response[property], value[property], `${path}.${property}`)
                if (!tempResult.pass) {
                    return tempResult;
                }
            }
        }
        return {
            message: () =>
                `ok`,
            pass: true,
        };

    }
}
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
    iterateExpect(response, value) {
        return _iterateExpect(response, value, "response")
    }

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
        let eventType = item.eventType ? item.eventType : "http";
        let input = { queryStringParameters: item.parms, body: JSON.stringify(item.parms) };
        const mod = require(appRoot + lambdaPath + item.uri);
        const lambdaWrapper = jestPlugin.lambdaWrapper;
        const wrapped = lambdaWrapper.wrap(mod, { handler: 'handler' });
        it(item.uri + ((item.description) ? " " + item.description : ""), async () => {
            return wrapped.run(input).then(async (response) => {
                console.log("\u001b[1;35m " + item.uri + ": result:" + JSON.stringify(response) + "\u001b[1;0m")
                try {
                    if (item.assert != undefined) {
                        if (eventType == "http") {

                            if (item.assert.checkType == "check_200") {
                                if (item.assert.not) {
                                    await expect(response).not.myToBe(200);
                                }
                                else {
                                    await expect(response).myToBe(200);
                                }
                            }
                            else if (item.assert.checkType == "check_value") {
                                let responseObject = JSON5.parse(response.body)
                                await expect(responseObject).iterateExpect(getValue(item.assert.target));
                            }
                        }
                    }
                    else {
                        await expect(response).myToBe(200);
                    }
                }
                catch (e) {
                    throw e;  // <= set your breakpoint here
                }
            })
        });
    });
}
module.exports.test = test;