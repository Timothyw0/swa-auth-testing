const { ManagedIdentityCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

async function getSecretFromKeyVault(keyvaultName, secretName) {
  const clientId = process.env.FUNCTIONS_MANAGED_IDENTITY_CLIENT_ID;
  if (!clientId) {
    throw "Managed Identity Client Id not found";
  }

  if (!keyvaultName || !secretName) {
    throw "Invalid parameters: missing keyvaultName or secretName in getSecretFromKeyVault";
  }

  const credential = new ManagedIdentityCredential(clientId);
  const keyvaultURL = `https://${keyvaultName}.vault.azure.net`;
  const client = new SecretClient(keyvaultURL, credential);

  try {
    const secret = await client.getSecret(secretName);
    return secret.value;
  } catch (error) {
    throw `Error retrieving secret: ${error}`;
  }
}

module.exports = { getSecretFromKeyVault };
