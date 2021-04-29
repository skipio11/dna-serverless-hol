#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { LegacyInfraStack } from '../lib/legacy-infra-stack';
import { LegacyAppStack } from '../lib/legacy-app-stack';

const app = new cdk.App();
const legacyInfraStack = new LegacyInfraStack(app, 'LegacyInfraStack');
new LegacyAppStack(app, 'LegacyAppStack', 
                    { vpc: legacyInfraStack.vpc, 
                        albSecurityGroup: legacyInfraStack.albSecurityGroup,
                        appSecurityGroup: legacyInfraStack.appSecurityGroup
                    });