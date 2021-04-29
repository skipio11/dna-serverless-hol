import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export class LegacyInfraStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly appSecurityGroup: ec2.SecurityGroup;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'VPC');
    const vpc = this.vpc;

    this.albSecurityGroup = new ec2.SecurityGroup(this, 'albSecurityGroup', {
      vpc,
      description: '',
      allowAllOutbound: true   // Can be set to false
    });

    this.appSecurityGroup = new ec2.SecurityGroup(this, 'appSecurityGroup', {
      vpc,
      description: '',
      allowAllOutbound: true   // Can be set to false
    });

    // internet -> alb
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow from internet');

    // alb -> was
    this.appSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(8080), 'Allow from ALB');

    // TODO : delete
    this.appSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Temporary');
  }
}
