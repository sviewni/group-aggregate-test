const net = require("net");
const axios = require("axios");

const ingestorPort = 8282;
const queryPort = 8181;
const host = "127.0.0.1";

function runTest(t0, metricName, stepSize, stepsCount, client) {
  return new Promise((resolve, reject) => {
    try {
      let ts = t0 - stepSize * stepsCount;
      let metricVal = 0;
      let payload = "";
      client.connect(ingestorPort, host, async function () {
        for (let i = 0; i < stepSize * stepsCount; i++) {
          payload += `+${metricName} tag=groupAgggrTest\r\n:${1e9 * ts++}\r\n+${
            100 * metricVal++
          }\r\n`;
        }

        await write(payload, client);
        await sleep(50); //below 50 results in lesser number of steps in response than expected
        const response = await axios.post(
          `http://${host}:${queryPort}/api/query`,
          getGroupAggregateQuery(t0, metricName, stepSize, stepsCount)
        );
        response.data
          .slice(0, -1)
          .split("\n")
          .map((line) => validateSteps(line.split(",")));

        resolve();
      });
    } catch (e) {
      console.error(e);
      reject();
    }
  });
}

let erroneousStepsCount = 0;
let totalStepsInResponse = 0;
function validateSteps(step) {
  if (step[3] - step[2] !== step[5] - step[4]) {
    console.error(
      `Erroneous response from group aggregate query, step timestamp: ${step[1].replace(
        /ts=/g,
        ""
      )}`
    );
    console.error(
      "for monotonically increasing metric, 'max - min' should be equal to 'first - last', instead observed..."
    );
    console.log(
      `first - last: ${step[3] - step[2]}\nmax - min: ${step[5] - step[4]}\n`
    );
    erroneousStepsCount++;
  }
  totalStepsInResponse++;
}

function getGroupAggregateQuery(t0, metricName, stepSize, stepsCount) {
  const aggregates = [
    "last",
    "first",
    "min",
    "max",
    "mean",
    "min_timestamp",
    "max_timestamp",
    "count",
  ];

  const query = {
    "group-aggregate": {},
    range: {},
  };
  query["group-aggregate"]["metric"] = metricName;
  query["group-aggregate"]["step"] = `${stepSize}s`;
  query["group-aggregate"]["func"] = aggregates;
  query["range"]["from"] = t0 * 1e9;
  query["range"]["to"] = (t0 - stepsCount * stepSize) * 1e9;
  query["order-by"] = "series";
  query["output"] = {
    format: "csv",
    timestamp: "raw",
  };

  return JSON.stringify(query);
}

async function runner(iterations) {
  const stepSize = 120;
  const stepsCount = 30;
  let unexpectedStepsCountInResponseCounter = 0;
  for (i = 0; i < iterations; i++) {
    let client = new net.Socket();
    client.on("data", function (data) {
      console.log("Received: " + data);
    });
    erroneousStepsCount = 0;
    totalStepsInResponse = 0;
    let t0 = Date.now() / 1e3;
    let metricName = `Metric${t0}`;
    await runTest(t0, metricName, stepSize, stepsCount, client);
    client.destroy();
    console.log(
      `Total steps in response: ${totalStepsInResponse}\nDetermined erroneous steps: ${erroneousStepsCount}`
    );
    if (stepsCount !== totalStepsInResponse) {
      unexpectedStepsCountInResponseCounter++;
    }
    await sleep(100);
  }
  if (unexpectedStepsCountInResponseCounter) {
    console.error(
      `In '${iterations}' iterations, observed unexpected steps count ${unexpectedStepsCountInResponseCounter} times`
    );
  }
}

async function write(data, client) {
  return new Promise((resolve) => {
    client.write(data, () => resolve());
  });
}

async function sleep(time) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      resolve(time);
    }, time);
  });
}

runner(1); //increase this count and reduce sleep time (<20) in runTest() to produce fewer than expected steps count

/**
 * Hardware used for above test, partial '/proc/cpuinfo'
processor       : 0
vendor_id       : GenuineIntel
cpu family      : 6
model           : 142
model name      : Intel(R) Core(TM) i3-8130U CPU @ 2.20GHz
stepping        : 10
microcode       : 0xca
cpu MHz         : 800.004
cache size      : 4096 KB
physical id     : 0
siblings        : 4
core id         : 0
cpu cores       : 2
apicid          : 0
initial apicid  : 0
fpu             : yes
fpu_exception   : yes
cpuid level     : 22
wp              : yes
flags           : fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb invpcid_single pti ssbd ibrs ibpb stibp tpr_shadow vnmi flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid mpx rdseed adx smap clflushopt intel_pt xsaveopt xsavec xgetbv1 xsaves dtherm ida arat pln pts hwp hwp_notify hwp_act_window hwp_epp md_clear flush_l1d
bugs            : cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs itlb_multihit
bogomips        : 4399.99
clflush size    : 64
cache_alignment : 64
address sizes   : 39 bits physical, 48 bits virtual
power management:

/dev/sda:

ATA device, with non-removable media
	Model Number:       ST1000LM048-2E7172                      
	Serial Number:      WKP6RZBG
	Firmware Revision:  0001    
	Transport:          Serial, ATA8-AST, SATA 1.0a, SATA II Extensions, SATA Rev 2.5, SATA Rev 2.6, SATA Rev 3.0
Standards:
	Used: unknown (minor revision code 0x001f) 
	Supported: 10 9 8 7 6 5 
	Likely used: 10
Configuration:
	Logical		max	current
	cylinders	16383	16383
	heads		16	16
	sectors/track	63	63
	--
	CHS current addressable sectors:    16514064
	LBA    user addressable sectors:   268435455
	LBA48  user addressable sectors:  1953525168
	Logical  Sector size:                   512 bytes
	Physical Sector size:                  4096 bytes
	Logical Sector-0 offset:                  0 bytes
	device size with M = 1024*1024:      953869 MBytes
	device size with M = 1000*1000:     1000204 MBytes (1000 GB)
	cache/buffer size  = unknown
	Form Factor: 2.5 inch
	Nominal Media Rotation Rate: 5400
Capabilities:
	LBA, IORDY(can be disabled)
	Queue depth: 32
	Standby timer values: spec'd by Standard, no device specific minimum
	R/W multiple sector transfer: Max = 16	Current = 16
	Advanced power management level: 254
	Recommended acoustic management value: 208, current value: 208
	DMA: mdma0 mdma1 mdma2 udma0 udma1 udma2 udma3 udma4 udma5 *udma6 
	     Cycle time: min=120ns recommended=120ns
	PIO: pio0 pio1 pio2 pio3 pio4 
	     Cycle time: no flow control=120ns  IORDY flow control=120ns
Commands/features:
	Enabled	Supported:
	   *	SMART feature set
	    	Security Mode feature set
	   *	Power Management feature set
	   *	Write cache
	   *	Look-ahead
	   *	Host Protected Area feature set
	   *	WRITE_BUFFER command
	   *	READ_BUFFER command
	   *	NOP cmd
	   *	DOWNLOAD_MICROCODE
	   *	Advanced Power Management feature set
	    	Power-Up In Standby feature set
	   *	SET_FEATURES required to spinup after power up
	    	SET_MAX security extension
	   *	48-bit Address feature set
	   *	Device Configuration Overlay feature set
	   *	Mandatory FLUSH_CACHE
	   *	FLUSH_CACHE_EXT
	   *	SMART error logging
	   *	SMART self-test
	   *	General Purpose Logging feature set
	   *	WRITE_{DMA|MULTIPLE}_FUA_EXT
	   *	64-bit World wide name
	   *	IDLE_IMMEDIATE with UNLOAD
	    	Write-Read-Verify feature set
	   *	WRITE_UNCORRECTABLE_EXT command
	   *	{READ,WRITE}_DMA_EXT_GPL commands
	   *	Segmented DOWNLOAD_MICROCODE
	   *	Gen1 signaling speed (1.5Gb/s)
	   *	Gen2 signaling speed (3.0Gb/s)
	   *	Gen3 signaling speed (6.0Gb/s)
	   *	Native Command Queueing (NCQ)
	   *	Host-initiated interface power management
	   *	Phy event counters
	   *	Idle-Unload when NCQ is active
	   *	READ_LOG_DMA_EXT equivalent to READ_LOG_EXT
	   *	DMA Setup Auto-Activate optimization
	   *	Device-initiated interface power management
	    	Asynchronous notification (eg. media change)
	   *	Software settings preservation
	   *	SMART Command Transport (SCT) feature set
	   *	SCT Write Same (AC2)
	   *	SCT Features Control (AC4)
	   *	SCT Data Tables (AC5)
	    	unknown 206[12] (vendor specific)
	    	unknown 206[13] (vendor specific)
	   *	DOWNLOAD MICROCODE DMA command
	   *	Data Set Management TRIM supported (limit 8 blocks)
Security: 
	Master password revision code = 65534
		supported
	not	enabled
	not	locked
	not	frozen
	not	expired: security count
		supported: enhanced erase
	172min for SECURITY ERASE UNIT. 172min for ENHANCED SECURITY ERASE UNIT.
Logical Unit WWN Device Identifier: 5000c500cd0bb054
	NAA		: 5
	IEEE OUI	: 000c50
	Unique ID	: 0cd0bb054
Checksum: correct

 */
