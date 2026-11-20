// Creates the clinic MCP integration user (run once). Permissions come only from Clinic_Demo_Integration.
// Run: sf apex run --file salesforce/scripts/create-integration-user.apex --target-org demo-org

String profileName = 'Minimum Access - Salesforce';
String username = 'mcp-clinic@orgfarm-e8c2b27448.demo';

List<User> existing = [SELECT Id, IsActive FROM User WHERE Username = :username];
if (!existing.isEmpty()) {
    System.debug('CLINIC USER EXISTS | ' + username + ' | active ' + existing[0].IsActive);
} else {
    Profile p = [SELECT Id FROM Profile WHERE Name = :profileName LIMIT 1];
    User admin = [SELECT Email FROM User WHERE Id = :UserInfo.getUserId()];
    User u = new User(
        Username = username,
        Email = admin.Email,
        FirstName = 'Clinic',
        LastName = 'MCP Integration',
        Alias = 'mcpclin',
        CommunityNickname = 'mcp-clinic',
        ProfileId = p.Id,
        TimeZoneSidKey = 'Europe/London',
        LocaleSidKey = 'en_GB',
        LanguageLocaleKey = 'en_US',
        EmailEncodingKey = 'UTF-8'
    );
    insert u;
    System.debug('CLINIC USER CREATED | ' + username + ' | ' + u.Id + ' | profile ' + profileName);
}