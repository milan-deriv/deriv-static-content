window.marketingTrackingSent = false;

function DerivMarketingCookies() {
  let cookieData = {
    original: {},
    sanitized: {},
  };
  // Initialize logging array in window
  window.marketingCookieLogs = [];
  window.marketingCookies = {};

  const log = (action, details) => {
    window.marketingCookieLogs.push({
      timestamp: new Date().toISOString(),
      action,
      details,
    });
  };

  log("DerivMarketingCookies", "Initialization started");

  /* utility functions */
  const getDomain = () => {
    const host_domain = location.hostname;
    const allowed_domains = ["deriv.com", "binary.sx"];

    const matched_domain = allowed_domains.find((allowed_domain) =>
      host_domain.includes(allowed_domain)
    );

    return matched_domain ?? host_domain;
  };

  const sanitizeCookieValue = (name, value) => {
    if (value === null || value === undefined) {
      return value;
    }

    try {
      // First try to decode the URL encoded string &  Check if it's still URL encoded (contains any %)
      let decodedValue =
        typeof value === "string" ? decodeURIComponent(value) : value;

      if (typeof decodedValue === "string" && decodedValue.includes("%")) {
        decodedValue = decodeURIComponent(decodedValue);
      }

      // Try to parse if it's a string that might be JSON
      const parsedValue =
        typeof decodedValue === "string"
          ? JSON.parse(decodedValue)
          : decodedValue;

      // If it's an object, sanitize each value
      if (typeof parsedValue === "object" && parsedValue !== null) {
        const sanitizedObject = {};
        Object.entries(parsedValue).forEach(([key, val]) => {
          if (typeof val === "string") {
            const sanitized = val.replace(/[^a-zA-Z0-9-_.,{}]/g, "");
            sanitizedObject[key] = sanitized;
          } else {
            sanitizedObject[key] = val;
          }
        });
        return JSON.stringify(sanitizedObject);
      }

      // If it's not an object, sanitize the string
      if (typeof value === "string") {
        return value.replace(/[^a-zA-Z0-9-_.,{}]/g, "");
      }

      return value;
    } catch (e) {
      // If parsing fails, it's not JSON, so sanitize the string
      if (typeof value === "string") {
        return value.replace(/[^a-zA-Z0-9-_.,{}]/g, "");
      }

      return value;
    }
  };

  const setCookie = (name, value) => {
    const sanitizedValue = sanitizeCookieValue(name, value);
    document.cookie = `${name}=${sanitizedValue}; expires=Tue, 19 Jan 9999 03:14:07 UTC; domain=${getDomain()}; path=/; SameSite=None; Secure;`;
    log("setCookie", {
      name,
      sanitizedValue,
      domain: getDomain(),
    });

    window.marketingCookies[name] = value;
    cookieData.original[name] = value;
    cookieData.sanitized[name] = sanitizedValue;
  };

  const eraseCookie = (name) => {
    const existingValue = getCookie(name);
    document.cookie = `${name}=; Max-Age=-99999999; domain=${getDomain()}; path=/;`;
    log("eraseCookie", { name, existingValue });
    delete window.marketingCookies[name];
  };

  const getCookie = (name) => {
    log("getCookie", { name, action: "started" });
    
    const dc = document.cookie;
    const prefix = name + "=";

    // check begin index
    let begin = dc.indexOf("; " + prefix);
    if (begin == -1) {
      begin = dc.indexOf(prefix);
      // cookie not available
    } else {
      begin += 2;
    }

    // check end index
    let end = document.cookie.indexOf(";", begin);
    if (end == -1) {
      end = dc.length;
    }

    const result = decodeURI(dc.substring(begin + prefix.length, end));
    log("getCookie", { name, result, reason: "cookie_found" });
    return result;
  };

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  };

  const toISOFormat = (date) => {
    if (date instanceof Date) {
      const utc_year = date.getUTCFullYear();
      const utc_month =
        (date.getUTCMonth() + 1 < 10 ? "0" : "") + (date.getMonth() + 1);
      const utc_date = (date.getUTCDate() < 10 ? "0" : "") + date.getUTCDate();

      return `${utc_year}-${utc_month}-${utc_date}`;
    }

    return "";
  };

  const shouldOverwrite = (new_utm_data, current_utm_data) => {
    log("shouldOverwrite", { new_utm_data, current_utm_data, action: "started" });
    
    // If we don't have old utm data, the utm_source field is enough for new utm data
    const valid_new_utm_source =
      new_utm_data.utm_source && new_utm_data.utm_source !== "null";
    if (!current_utm_data && valid_new_utm_source) {
      log("shouldOverwrite", {
        reason: "No current UTM data and valid new UTM source",
        new_utm_data,
        result: true
      });
      return true;
    }

    // If we have old utm data, 3 fields are required for new utm data to rewrite the old one
    const required_fields = ["utm_source", "utm_medium", "utm_campaign"];
    const has_new_required_fields = required_fields.every(
      (field) => new_utm_data[field]
    );
    if (has_new_required_fields) {
      log("shouldOverwrite", {
        reason: "All required fields present in new UTM data",
        new_utm_data,
        current_utm_data,
        result: true
      });
      return true;
    }

    log("shouldOverwrite", {
      reason: "Conditions not met for overwrite",
      new_utm_data,
      current_utm_data,
      result: false
    });
    return false;
  };

  const searchParams = new URLSearchParams(window.location.search);
  const brand_name = "deriv";
  const app_id = 11780;

  /* start handling UTMs */
  log("UTM_handling", "Started UTM parameter processing");
  
  const utm_fields = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_ad_id",
    "utm_click_id",
    "utm_adgroup_id",
    "utm_campaign_id",
    "utm_msclk_id",
    // For cases where we need to map the query param to some different name e.g [name_from_query_param, mapped_name]
    ["fbclid", "utm_fbcl_id"],
    ["ttclid", "utm_ttclid"],
    ["ScCid", "utm_sccid"],
  ];

  let utm_data = {};
  let affiliate_tracking = null;
  const utm_data_cookie = getCookie("utm_data");
  const current_utm_data = utm_data_cookie
    ? JSON.parse(decodeURIComponent(utm_data_cookie))
    : {};

  log("UTM_handling", { utm_data_cookie, current_utm_data });

  // If the user comes to the site for the first time without any URL params
  // Only set the utm_source to referrer if the user does not have utm_data cookies stored
  if (!current_utm_data?.utm_source) {
    utm_data = {
      utm_source: document.referrer ? document.referrer : "null",
    };
  }

  // If the user has any new UTM params, store them
  utm_fields.forEach((field) => {
    if (Array.isArray(field)) {
      const [field_key, mapped_field_value] = field;
      if (searchParams.has(field_key)) {
        const value = searchParams.get(field_key).substring(0, 200);
        utm_data[mapped_field_value] = value;
        log("UTM_handling", { action: "mapped_field_added", field_key, mapped_field_value, value });
      }
    } else {
      if (searchParams.has(field)) {
        const value = searchParams.get(field).substring(0, 100);
        utm_data[field] = value;
        log("UTM_handling", { action: "field_added", field, value });
      }
    }
  });

  let potential_mistagging = true;
  let overwrite_happened = false;
  let dropped_affiliate_tracking = null;

  if (shouldOverwrite(utm_data, current_utm_data)) {
    log("UTM_handling", "Overwriting existing UTM data");
    eraseCookie("affiliate_tracking");
    eraseCookie("utm_data");

    const utm_data_cookie = encodeURIComponent(JSON.stringify(utm_data))
      .replaceAll("%2C", ",")
      .replaceAll("%7B", "{")
      .replaceAll("%7D", "}");

    setCookie("utm_data", utm_data_cookie);
    overwrite_happened = true;
    log("UTM_handling", { action: "overwrite_completed", utm_data_cookie, overwrite_happened });
  } else {
    potential_mistagging = false;
    log("UTM_handling", { action: "no_overwrite", potential_mistagging });
  }

  log("UTM_handling", "Completed UTM parameter processing");
  /* end handling UTMs */

  /* start handling affiliate tracking */
  log("affiliate_tracking", "Started affiliate tracking processing");
  
  const isAffiliateTokenExist =
    searchParams.has("t") || searchParams.has("affiliate_token");
  log("affiliate_tracking", { isAffiliateTokenExist, hasT: searchParams.has("t"), hasAffiliateToken: searchParams.has("affiliate_token") });
  
  if (isAffiliateTokenExist) {
    if (overwrite_happened) {
      dropped_affiliate_tracking = getCookie("affiliate_token");
      potential_mistagging = false;
      log("affiliate_tracking", { action: "dropped_existing", dropped_affiliate_tracking, potential_mistagging });
    }

    eraseCookie("affiliate_tracking");
    const affiliateToken =
      searchParams.get("t") || searchParams.get("affiliate_token");
    setCookie("affiliate_tracking", affiliateToken);
    affiliate_tracking = affiliateToken;
    log("affiliate_tracking", { action: "token_set", affiliateToken });
  }

  if (searchParams.has("sidc")) {
    log("affiliate_tracking", { action: "sidc_processing", sidcValue: searchParams.get("sidc") });
    
    eraseCookie("affiliate_tracking");
    const sidcValue = searchParams.get("sidc");
    setCookie("affiliate_tracking", sidcValue);
    affiliate_tracking = sidcValue;

    if (overwrite_happened) {
      dropped_affiliate_tracking = getCookie("affiliate_token");
      potential_mistagging = false;
      log("affiliate_tracking", { action: "sidc_dropped_existing", dropped_affiliate_tracking, potential_mistagging });
    }
  }
  
  log("affiliate_tracking", "Completed affiliate tracking processing");
  /* end handling affiliate tracking */

  /* start handling signup device */
  log("signup_device", "Started signup device processing");
  
  const signup_device_cookie_unparsed = getCookie("signup_device") || "{}";
  const signup_device_cookie = JSON.parse(
    decodeURI(signup_device_cookie_unparsed).replaceAll("%2C", ",")
  );
  log("signup_device", { signup_device_cookie_unparsed, signup_device_cookie });
  
  if (!signup_device_cookie.signup_device) {
    const device = isMobile() ? "mobile" : "desktop";
    const signup_data = {
      signup_device: device,
    };
    const signup_data_cookie = encodeURI(JSON.stringify(signup_data))
      .replaceAll(",", "%2C")
      .replaceAll("%7B", "{")
      .replaceAll("%7D", "}");

    document.cookie = `signup_device=${signup_data_cookie};domain=${getDomain()}; path=/; SameSite=None; Secure;`;
    log("signup_device", { action: "device_set", device, signup_data_cookie });
  } else {
    cookieData.original.signup_device = signup_device_cookie.signup_device;
    cookieData.sanitized.signup_device = signup_device_cookie.signup_device;
    log("signup_device", { action: "existing_device_used", device: signup_device_cookie.signup_device });
  }
  
  log("signup_device", "Completed signup device processing");
  /* end handling signup device */

  /* start handling date first contact */
  log("date_first_contact", "Started date first contact processing");
  
  const date_first_contact_cookie_unparsed =
    getCookie("date_first_contact") || "{}";
  const date_first_contact_cookie = JSON.parse(
    decodeURI(date_first_contact_cookie_unparsed).replaceAll("%2C", ",")
  );
  log("date_first_contact", { date_first_contact_cookie_unparsed, date_first_contact_cookie });

  if (!date_first_contact_cookie.date_first_contact) {
    const date_first_contact_response = Math.floor(Date.now() / 1000);

    const date_first_contact_data = {
      date_first_contact: toISOFormat(
        new Date(date_first_contact_response * 1000)
      ),
    };

    const date_first_contact_data_cookie = encodeURI(
      JSON.stringify(date_first_contact_data)
    )
      .replaceAll(",", "%2C")
      .replaceAll("%7B", "{")
      .replaceAll("%7D", "}");

    document.cookie = `date_first_contact=${date_first_contact_data_cookie};domain=${getDomain()}; path=/; SameSite=None; Secure;`;
    log("date_first_contact", { action: "date_set", date_first_contact_response, date_first_contact_data, date_first_contact_data_cookie });
  } else {
    cookieData.original.date_first_contact =
      date_first_contact_cookie.date_first_contact;
    cookieData.sanitized.date_first_contact =
      date_first_contact_cookie.date_first_contact;
    log("date_first_contact", { action: "existing_date_used", date: date_first_contact_cookie.date_first_contact });
  }

  log("date_first_contact", "Completed date first contact processing");
  /* end handling date first contact */

  /* start handling gclid */
  log("gclid", "Started gclid processing");
  
  const gclid = searchParams.get("gclid");
  const gclid_url = searchParams.get("gclid_url");
  const final_gclid = gclid || gclid_url || "";
  log("gclid", { gclid, gclid_url, final_gclid });

  if (!!final_gclid) {
    eraseCookie("gclid");
    setCookie("gclid", final_gclid);
    log("gclid", { action: "gclid_set", final_gclid });
  } else {
    log("gclid", { action: "no_gclid_found" });
  }
  
  log("gclid", "Completed gclid processing");
  /* end handling gclid */

  /* start handling campaign channel */
  log("campaign_channel", "Started campaign channel processing");
  
  const campaign_channel = searchParams.get("ca");
  log("campaign_channel", { campaign_channel });

  if (campaign_channel) {
    eraseCookie("campaign_channel");
    setCookie("campaign_channel", campaign_channel);
    log("campaign_channel", { action: "channel_set", campaign_channel });
  } else {
    log("campaign_channel", { action: "no_channel_found" });
  }
  
  log("campaign_channel", "Completed campaign channel processing");
  /* end handling campaign channel */

  log("DerivMarketingCookies", "Initialization completed");

  const stringifyCookieValue = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (e) {
      console.warn("Failed to stringify cookie value:", e);
      return String(value);
    }
  };

  const getStringifiedCookies = () => {
    const stringifiedCookies = {};
    Object.entries(window.marketingCookies).forEach(([name, value]) => {
      stringifiedCookies[name] = stringifyCookieValue(value);
    });
    return stringifiedCookies;
  };

  const testCookieFunctionality = () => {
    try {
      // Test basic cookie functionality
      document.cookie = "deriv_test_cookie=1; SameSite=None; Secure";
      const test_result = document.cookie.includes("deriv_test_cookie=");

      // Gather browser and cookie configuration info
      const cookieInfo = {
        status: test_result ? "enabled" : "disabled",
        browser: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          vendor: navigator.vendor,
        },
        cookieConfig: {
          sameSite: "None",
          secure: true,
          domain: getDomain(),
        },
        cookieSettings: {
          thirdPartyCookies: test_result ? "supported" : "blocked",
          cookieEnabled: navigator.cookieEnabled,
          doNotTrack: navigator.doNotTrack || window.doNotTrack,
        },
        storage: {
          localStorage: (() => {
            try {
              localStorage.setItem("test", "test");
              localStorage.removeItem("test");
              return "supported";
            } catch (e) {
              return "blocked";
            }
          })(),
          sessionStorage: (() => {
            try {
              sessionStorage.setItem("test", "test");
              sessionStorage.removeItem("test");
              return "supported";
            } catch (e) {
              return "blocked";
            }
          })(),
        },
      };

      if (!test_result) {
        console.warn("⚠️ Cookies not stored - possibly ITP or blocked.");
      }

      return JSON.stringify(cookieInfo);
    } catch (e) {
      console.warn("❌ Cookie setting failed:", e);
      return `error: ${e.message || e.toString()}`;
    }
  };

  const waitForTrackEvent = (retries = 150, interval = 1000) => {
    const getTrackEventFn = () => {
      return window.Analytics?.trackEvent instanceof Function
        ? window.Analytics.trackEvent
        : window.Analytics?.Analytics?.trackEvent instanceof Function
        ? window.Analytics.Analytics.trackEvent
        : null;
    };

    const trackEvent = getTrackEventFn();

    if (trackEvent) {
      setTimeout(() => {
        console.warn("Marketing cookies has been handled");
        trackEvent("debug_marketing_cookies", {
          marketing_cookies: getStringifiedCookies(),
          cookie_status: testCookieFunctionality(),
          potential_mistagging,
          overwrite_happened,
          dropped_affiliate_tracking,
          cookie_logs: window.marketingCookieLogs,
          utm_data,
          affiliate_tracking,
        });
      }, 1000);
    } else if (retries > 0) {
      setTimeout(() => waitForTrackEvent(retries - 1, interval), interval);
    } else {
      console.warn("trackEvent not available after waiting.");
    }
  };

  if (!window.marketingTrackingSent) {
    waitForTrackEvent();
    window.marketingTrackingSent = true;
  }

  return cookieData;
}

DerivMarketingCookies();

window.getMarketingCookies = () => {
  return DerivMarketingCookies();
};
