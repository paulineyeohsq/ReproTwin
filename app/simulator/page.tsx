import { SimulatorClient } from "@/components/simulator/SimulatorClient";
import {
  getHourlyExposureRateProfile,
  getWorkingDayCountLast90,
  getLowExposureDiscount,
  getDigitalTwinStats,
  getDataProvenance,
} from "@/lib/dataAccess";

export default function SimulatorPage() {
  const hourlyProfile = getHourlyExposureRateProfile();
  const workingDaysLast90 = getWorkingDayCountLast90();
  const lowExposureDiscount = getLowExposureDiscount();
  const observedRidingHours = getDigitalTwinStats().avgRidingHoursPerDay;
  const provenance = getDataProvenance();

  return (
    <SimulatorClient
      hourlyProfile={hourlyProfile}
      workingDaysLast90={workingDaysLast90}
      lowExposureDiscount={lowExposureDiscount}
      observedRidingHours={observedRidingHours}
      provenance={provenance}
    />
  );
}
