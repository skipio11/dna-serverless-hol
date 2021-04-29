. ./deploy-env.sh
cdk deploy --context legacyEndpoint=$LEGACY_ENDPOINT --context adminEmail=$ADMIN_EMAIL --all --require-approval never
