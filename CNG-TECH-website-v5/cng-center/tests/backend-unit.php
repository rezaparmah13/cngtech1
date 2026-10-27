<?php
declare(strict_types=1);
// CLI only; synthetic fixtures, no database or private configuration needed.
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/public/api/lib.php';
$count = 0;
function check(bool $condition, string $name): void {
    global $count;
    if (!$condition) throw new RuntimeException('FAIL: ' . $name);
    $count++;
}
function rejected(array $input, string $name): void {
    try { validate_request($input); }
    catch (InvalidArgumentException $e) { check(true, $name); return; }
    check(false, $name);
}
function fixture_id(string $prefix): string {
    $sum = 0;
    for ($i = 0; $i < 9; $i++) $sum += (int)$prefix[$i] * (10 - $i);
    $r = $sum % 11;
    return $prefix . ($r < 2 ? $r : 11 - $r);
}
$adult = ['ownerType'=>'adult', 'ownerId'=>fixture_id('123456789'), 'ownerBirth'=>'1370/05/21', 'mobile'=>'09000000000', 'plate'=>'12 ب 345 ایران 67', 'consent'=>'on'];
check(digits(' ۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩ ') === '01234567890123456789', 'digit normalization');
check(national_id($adult['ownerId']), 'checksum fixture');
foreach (['0000000000','1111111111','123','1234567890',"1234567891\n",'<script>'] as $id) check(!national_id($id), 'invalid national ID');
check(birth_date('1370/06/31'), '31-day month');
foreach (['1370/07/31','1370/13/01','1370/01/00','1370/1/1',"1370/01/01\n"] as $date) check(!birth_date($date), 'invalid date');
check(validate_request($adult)['ownerType'] === 'adult', 'adult');
$minor = array_replace($adult, ['ownerType'=>'minor','ownerBirth'=>'1395/01/01','guardianRelation'=>'father','guardianId'=>fixture_id('987654321'),'guardianBirth'=>'1365/02/10']);
check(validate_request($minor)['guardianRelation'] === 'father', 'minor father');
check(validate_request(array_replace($minor,['guardianRelation'=>'mother']))['guardianRelation'] === 'mother', 'minor mother');
foreach (['consent'=>'', 'ownerType'=>'unknown', 'ownerId'=>['bad'], 'ownerBirth'=>'1370/07/31', 'mobile'=>'123', 'plate'=>'<script>1</script>'] as $key=>$value) rejected(array_replace($adult, [$key=>$value]), 'invalid '.$key);
foreach (['guardianRelation'=>'other','guardianId'=>$adult['ownerId'],'guardianBirth'=>'invalid'] as $key=>$value) rejected(array_replace($minor,[$key=>$value]), 'invalid '.$key);
rejected(array_replace($adult,['ownerType'=>'minor']), 'missing guardian');
rejected(array_replace($adult,['alternateContact'=>'on']), 'missing callback');
check(validate_request(array_replace($adult,['alternateContact'=>'on','callback'=>'09000000001']))['callback'] === '09000000001', 'alternate callback');
$out = validate_request(array_replace($adult,['otp'=>'NOT-AN-OTP','password'=>'NOT-A-PASSWORD','guardianId'=>$minor['guardianId'],'callback'=>'09000000001']));
check(!isset($out['otp'],$out['password']) && !array_key_exists('otp',$out) && !array_key_exists('password',$out), 'secrets never retained');
check(!isset($out['guardianId']) && !isset($out['callback']), 'inactive fields omitted');
check($out['consentVersion'] === 'request-v2-privacy-linked', 'consent version');
check(html('<script>"&') === '&lt;script&gt;&quot;&amp;', 'HTML escaping');
echo "PASS: $count backend unit assertions\n";
