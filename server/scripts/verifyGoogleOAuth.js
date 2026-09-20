import { nanoid } from "nanoid";

const BASE_URL = "http://localhost:4000/api";

async function run() {
  console.log("=== STARTING DEDICATED GOOGLE OAUTH REGRESSION TEST ===");
  let passed = 0;
  let total = 0;

  function assert(name, condition, details = "") {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} — ${details}`);
    }
  }

  try {
    // Test 1: Health check confirms Supabase client
    const health = await (await fetch("http://localhost:4000/health")).json();
    assert("Health endpoint confirms Supabase initialized", health.supabase.clientInitialized === true);

    // Test 2: Sync existing user
    const existingSync = await (await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "shaik.alfhi@kisansetu.in",
        fullName: "Shaik Alfhi",
        supabaseUserId: "6cbb482e-bb6a-4ef5-b3be-112142c7a07d"
      })
    })).json();

    assert("Sync existing user returns isNewUser=false", existingSync.isNewUser === false);
    assert("Sync existing user returns valid user object", Boolean(existingSync.user?.id));
    assert("Sync existing user returns valid session token", Boolean(existingSync.token));
    assert("Sync existing user has no password_hash exposed", existingSync.user?.password_hash === undefined);

    // Test 3: New user without role triggers role selection
    const newUid = `test-google-${nanoid(8)}`;
    const newEmail = `newuser_${nanoid(6)}@gmail.com`;

    const needsRoleRes = await (await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail,
        fullName: "New Google User",
        supabaseUserId: newUid
      })
    })).json();

    assert("New user without role returns needsRoleSelection=true", needsRoleRes.needsRoleSelection === true);
    assert("New user without role returns allowed roles", Array.isArray(needsRoleRes.allowedRoles) && needsRoleRes.allowedRoles.includes("farmer"));

    // Test 4: Reject Admin self-selection
    const adminAttemptRes = await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail,
        fullName: "Hacker Attempt",
        supabaseUserId: newUid,
        role: "admin"
      })
    });
    assert("Reject Admin self-selection with HTTP 400", adminAttemptRes.status === 400);

    // Test 5: Register new user as Farmer
    const farmerUid = `sb-user-${nanoid(12)}`;
    const farmerEmail = `google_farmer_${nanoid(5)}@gmail.com`;

    const farmerRegisterRes = await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: farmerEmail,
        fullName: "Ramesh Farmer",
        supabaseUserId: farmerUid,
        role: "farmer"
      })
    });
    assert("New Farmer registration returns HTTP 201", farmerRegisterRes.status === 201);
    const farmerData = await farmerRegisterRes.json();
    assert("New Farmer has isNewUser=true", farmerData.isNewUser === true);
    assert("New Farmer user ID equals Supabase user ID exactly", farmerData.user?.id === farmerUid);
    assert("New Farmer profile created with district", farmerData.profile?.district === "Guntur");
    assert("New Farmer profile has user_id referencing Supabase user ID", farmerData.profile?.user_id === farmerUid);
    assert("New Farmer response has token", Boolean(farmerData.token));
    assert("New Farmer password_hash strictly omitted", farmerData.user?.password_hash === undefined);

    // Test 6: Subsequent login with same account returns existing user
    const subsequentLogin = await (await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: farmerEmail,
        fullName: "Ramesh Farmer",
        supabaseUserId: farmerUid
      })
    })).json();

    assert("Subsequent Google login identifies existing user (isNewUser=false)", subsequentLogin.isNewUser === false);
    assert("Subsequent Google login does not request role again", subsequentLogin.needsRoleSelection !== true);
    assert("Subsequent Google login user matches registered farmer", subsequentLogin.user?.id === farmerUid);

    // Test 7: Register new Buyer
    const buyerUid = `sb-user-${nanoid(12)}`;
    const buyerEmail = `google_buyer_${nanoid(5)}@gmail.com`;
    const buyerRes = await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: buyerEmail,
        fullName: "Apex Agrico Buyer",
        supabaseUserId: buyerUid,
        role: "buyer"
      })
    });
    assert("New Buyer registration returns HTTP 201", buyerRes.status === 201);
    const buyerData = await buyerRes.json();
    assert("New Buyer profile created", buyerData.profile?.buyer_type === "Wholesaler");
    assert("New Buyer user_id references Supabase user ID", buyerData.profile?.user_id === buyerUid);

    // Test 8: Register new FPO
    const fpoUid = `sb-user-${nanoid(12)}`;
    const fpoEmail = `google_fpo_${nanoid(5)}@gmail.com`;
    const fpoRes = await fetch(`${BASE_URL}/auth/sync-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fpoEmail,
        fullName: "Godavari Farmer Producer Co",
        supabaseUserId: fpoUid,
        role: "fpo"
      })
    });
    assert("New FPO registration returns HTTP 201", fpoRes.status === 201);
    const fpoData = await fpoRes.json();
    assert("New FPO profile created", Boolean(fpoData.profile?.id));
    assert("New FPO user_id references Supabase user ID", fpoData.profile?.user_id === fpoUid);

    console.log(`\n=== GOOGLE OAUTH TEST SUMMARY: ${passed}/${total} PASSED ===`);
  } catch (err) {
    console.error("Test execution error:", err);
  }
}

run();
