package com.antigravity.travel;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ContactPickerPlugin — opens Android's native contact picker (ACTION_PICK)
 * and returns the selected contact's display name and phone number.
 * No extra permissions needed beyond READ_CONTACTS (already in manifest).
 */
@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {

    @PluginMethod
    public void pickContact(PluginCall call) {
        Intent intent = new Intent(
            Intent.ACTION_PICK,
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        );
        startActivityForResult(call, intent, "onContactPickResult");
    }

    @ActivityCallback
    private void onContactPickResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }

        Uri contactUri = result.getData().getData();
        if (contactUri == null) { call.reject("no contact URI"); return; }

        String[] projection = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = getContext().getContentResolver().query(
                contactUri, projection, null, null, null)) {

            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(
                    cursor.getColumnIndexOrThrow(
                        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME));
                String phone = cursor.getString(
                    cursor.getColumnIndexOrThrow(
                        ContactsContract.CommonDataKinds.Phone.NUMBER));

                JSObject res = new JSObject();
                res.put("name",  name  != null ? name  : "");
                res.put("phone", phone != null ? phone : "");
                call.resolve(res);
            } else {
                call.reject("contact not found");
            }
        } catch (Exception e) {
            call.reject("Error reading contact: " + e.getMessage());
        }
    }
}
