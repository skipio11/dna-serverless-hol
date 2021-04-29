import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as Jmeter from '../lib/jmeter-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new Jmeter.JmeterStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
